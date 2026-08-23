import { prisma } from "../lib/prisma.js";
import { sendPushNotification, isWebPushConfigured } from "../lib/webPush.js";

function getUserExtraFields(preferences) {
  if (!preferences?.metadata || typeof preferences.metadata !== "object") return {};
  return preferences.metadata._extraFields || {};
}

function getPushSubscription(preferences) {
  const extra = getUserExtraFields(preferences);
  return extra.push_subscription || null;
}

function shouldSendPush(preferences) {
  if (!preferences) return true;
  if (preferences.pushNotifications === false) return false;
  return true;
}

function getTaskExtraFields(task) {
  if (task?.metadata && typeof task.metadata === "object") {
    return task.metadata._extraFields || {};
  }
  return {};
}

function buildTaskMetadataWithExtra(task, patch) {
  const base = task?.metadata && typeof task.metadata === "object" ? { ...task.metadata } : {};
  const prev = base._extraFields && typeof base._extraFields === "object" ? { ...base._extraFields } : {};
  base._extraFields = { ...prev, ...patch };
  return base;
}

async function createInAppNotification(userId, title, body, payload = {}) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        channel: "in_app",
        status: "SENT",
        payload: {
          type: "reminder",
          ...payload,
        },
      },
    });
  } catch (e) {
    console.warn("[reminderSender] failed to create in-app notification:", e?.message || e);
  }
}

async function trySendPush({ userId, preferences, payload, logPrefix }) {
  const subscription = getPushSubscription(preferences);
  const pushEnabled = shouldSendPush(preferences);

  if (!subscription || !pushEnabled) {
    const reason = !subscription ? "no_push_subscription" : "push_disabled_by_user";
    console.log(`[reminderSender] ${logPrefix} user=${userId} skipped push: ${reason}`);
    await createInAppNotification(
      userId,
      payload.title,
      payload.body,
      { ...payload.data, url: payload.url, fallback_reason: reason }
    );
    return { ok: false, reason, inAppFallback: true };
  }

  try {
    await sendPushNotification(subscription, payload);
    console.log(`[reminderSender] ${logPrefix} user=${userId} push sent to ${subscription.endpoint?.slice(0, 60)}...`);
    return { ok: true };
  } catch (err) {
    console.warn(`[reminderSender] ${logPrefix} user=${userId} push failed:`, err?.message || err);
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      await prisma.userPreference.update({
        where: { userId },
        data: {
          metadata: {
            ...(preferences?.metadata || {}),
            _extraFields: {
              ...getUserExtraFields(preferences),
              push_subscription: null,
            },
          },
        },
      }).catch(() => {});
    }
    await createInAppNotification(
      userId,
      payload.title,
      payload.body,
      { ...payload.data, url: payload.url, fallback_reason: "push_failed", error: err?.message }
    );
    return { ok: false, reason: "push_failed", error: err, inAppFallback: true };
  }
}

export async function sendDueReminders() {
  const now = new Date();
  if (!isWebPushConfigured()) {
    console.log("[reminderSender] web push not configured, skipping push (will still create in-app notifications)");
  }

  // 找提醒时间已到、且未发送过提醒或提醒时间比上次发送时间更新的约定
  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DONE", "ARCHIVED"] },
      reminderTime: { not: null, lte: now },
    },
    include: { user: { include: { preferences: true } } },
  });

  const dueTasks = candidates.filter((task) => {
    if (!task.reminderSentAt) return true;
    return task.reminderTime > task.reminderSentAt;
  });

  let sent = 0;
  let skipped = 0;
  let inAppFallback = 0;

  for (const task of dueTasks) {
    const payload = {
      title: `约定提醒：${task.title}`,
      body: task.description ? task.description.slice(0, 120) : "您有一个约定到时间了",
      url: `/tasks?id=${task.id}`,
      tag: `reminder-${task.id}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { taskId: task.id, type: "reminder" },
    };

    const result = await trySendPush({
      userId: task.userId,
      preferences: task.user.preferences,
      payload,
      logPrefix: `start-reminder task=${task.id}`,
    });

    if (result.ok) sent += 1;
    if (result.reason && result.reason !== "push_failed") skipped += 1;
    if (result.inAppFallback) inAppFallback += 1;

    // 无论发送成功与否，都更新 reminderSentAt，避免同一分钟重复尝试
    try {
      await prisma.task.update({
        where: { id: task.id },
        data: { reminderSentAt: now },
      });
    } catch (updateErr) {
      console.warn(`[reminderSender] task=${task.id} failed to update reminderSentAt:`, updateErr);
    }
  }

  const result = { sent, skipped, inAppFallback, total: dueTasks.length };
  if (dueTasks.length > 0) {
    console.log("[reminderSender] start reminders:", result);
  }
  return result;
}

/**
 * 在约定 end_time 到达时发送一次「温和跟进」：
 * 不把它当作闹钟，而是像助手一样问用户是否完成、是否需要延长。
 */
export async function sendEndTimeFollowUps() {
  const now = new Date();
  if (!isWebPushConfigured()) {
    console.log("[reminderSender] web push not configured, skipping follow-up push (will still create in-app notifications)");
  }

  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DONE", "ARCHIVED"] },
      endTime: { not: null, lte: now },
    },
    include: { user: { include: { preferences: true } } },
  });

  let sent = 0;
  let skipped = 0;
  let inAppFallback = 0;

  for (const task of candidates) {
    const extra = getTaskExtraFields(task);
    const lastSentAt = extra.end_reminder_sent_at ? new Date(extra.end_reminder_sent_at) : null;
    // 只对“当前 end_time 比上次跟进时间更新”的任务触发，避免重复
    if (lastSentAt && task.endTime <= lastSentAt) {
      continue;
    }

    const payload = {
      title: `约定跟进：${task.title}`,
      body: "约定的预计时间到了，完成了吗？需要延长或调整吗？",
      url: `/tasks?id=${task.id}`,
      tag: `followup-${task.id}`,
      requireInteraction: false,
      vibrate: [150, 80, 150],
      data: { taskId: task.id, type: "follow_up" },
    };

    const result = await trySendPush({
      userId: task.userId,
      preferences: task.user.preferences,
      payload,
      logPrefix: `end-followup task=${task.id}`,
    });

    if (result.ok) sent += 1;
    if (result.reason && result.reason !== "push_failed") skipped += 1;
    if (result.inAppFallback) inAppFallback += 1;

    try {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: buildTaskMetadataWithExtra(task, { end_reminder_sent_at: now.toISOString() }),
        },
      });
    } catch (updateErr) {
      console.warn(`[reminderSender] task=${task.id} failed to update end_reminder_sent_at:`, updateErr);
    }
  }

  const result = { sent, skipped, inAppFallback, total: candidates.length };
  if (candidates.length > 0) {
    console.log("[reminderSender] end-time follow-ups:", result);
  }
  return result;
}

export async function sendTestPush(userId) {
  if (!isWebPushConfigured()) {
    return { ok: false, error: "web_push_not_configured" };
  }

  const preferences = await prisma.userPreference.findUnique({ where: { userId } });
  const subscription = getPushSubscription(preferences);
  if (!subscription) {
    return { ok: false, error: "no_push_subscription" };
  }
  if (!shouldSendPush(preferences)) {
    return { ok: false, error: "push_disabled_by_user" };
  }

  const payload = {
    title: "SoulSentry 测试通知",
    body: "如果您看到这条消息，说明推送服务已正常工作。",
    url: "/",
    tag: "test-push",
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { type: "test" },
  };

  try {
    await sendPushNotification(subscription, payload);
    return { ok: true };
  } catch (err) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      await prisma.userPreference.update({
        where: { userId },
        data: {
          metadata: {
            ...(preferences?.metadata || {}),
            _extraFields: {
              ...getUserExtraFields(preferences),
              push_subscription: null,
            },
          },
        },
      }).catch(() => {});
    }
    return { ok: false, error: err?.message || String(err), statusCode: err?.statusCode };
  }
}
