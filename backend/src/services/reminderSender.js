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

export async function sendDueReminders() {
  const now = new Date();
  if (!isWebPushConfigured()) {
    console.log("[reminderSender] web push not configured, skipping push (will still create in-app notifications)");
  }

  // 找提醒时间已到、且未发送过提醒或提醒时间比上次发送时间更新的约定
  // 注意：SQLite 不支持 Prisma 字段比较，所以先拉候选集，再在内存里做二次过滤。
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
  const errors = [];

  for (const task of dueTasks) {
    const subscription = getPushSubscription(task.user.preferences);
    const pushEnabled = shouldSendPush(task.user.preferences);

    const payload = {
      title: `约定提醒：${task.title}`,
      body: task.description ? task.description.slice(0, 120) : "您有一个约定到时间了",
      url: `/tasks?id=${task.id}`,
      tag: `reminder-${task.id}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { taskId: task.id, type: "reminder" },
    };

    let pushOk = false;

    if (!subscription || !pushEnabled) {
      const reason = !subscription ? "no_push_subscription" : "push_disabled_by_user";
      console.log(`[reminderSender] task=${task.id} skipped push: ${reason}`);
      skipped += 1;
      // 兜底：写入应用内通知，让用户打开 App 后能看到
      await createInAppNotification(
        task.userId,
        payload.title,
        payload.body,
        { taskId: task.id, url: payload.url, fallback_reason: reason }
      );
      inAppFallback += 1;
    } else {
      try {
        await sendPushNotification(subscription, payload);
        sent += 1;
        pushOk = true;
        console.log(`[reminderSender] task=${task.id} push sent to ${subscription.endpoint?.slice(0, 60)}...`);
      } catch (err) {
        errors.push({ taskId: task.id, error: err?.message || String(err), statusCode: err?.statusCode });
        console.warn(`[reminderSender] task=${task.id} push failed:`, err?.message || err);
        // 订阅失效时清理，避免反复报错
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try {
            await prisma.userPreference.update({
              where: { userId: task.userId },
              data: {
                metadata: {
                  ...(task.user.preferences?.metadata || {}),
                  _extraFields: {
                    ...getUserExtraFields(task.user.preferences),
                    push_subscription: null,
                  },
                },
              },
            });
            console.log(`[reminderSender] task=${task.id} cleared expired push subscription`);
          } catch (cleanupErr) {
            console.warn("[reminderSender] failed to clear expired subscription:", cleanupErr);
          }
        }
        // 推送失败也创建应用内通知兜底
        await createInAppNotification(
          task.userId,
          payload.title,
          payload.body,
          { taskId: task.id, url: payload.url, fallback_reason: "push_failed", error: err?.message }
        );
        inAppFallback += 1;
      }
    }

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

  if (errors.length > 0) {
    console.warn("[reminderSender] push errors:", errors);
  }

  const result = { sent, skipped, inAppFallback, total: dueTasks.length };
  if (dueTasks.length > 0) {
    console.log("[reminderSender] reminders:", result);
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
