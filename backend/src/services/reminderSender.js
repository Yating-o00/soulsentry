import { prisma } from "../lib/prisma.js";
import { sendPushNotification, isWebPushConfigured } from "../lib/webPush.js";
import { sendWechatSubscribeMessage } from "../lib/wechatSubscribeMessage.js";
import { computeNextReminderTime } from "../lib/recurrence.js";
import { buildReminderCopy } from "./reminderCopy.js";
import { getWeatherForCoords, weatherContextForReminder } from "./weatherService.js";

// 提醒场景的天气上下文：用用户最近上报的位置（看板请求 /api/weather 时持久化），
// 天气数据有 30 分钟进程内缓存，cron 每分钟跑也不会重复打外部接口
async function getWeatherContextForUser(preferences, task) {
  const loc = preferences?.metadata?.last_location;
  const lat = Number(loc?.latitude);
  const lon = Number(loc?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const weather = await getWeatherForCoords(lat, lon);
    return weatherContextForReminder(weather, task);
  } catch (_err) {
    return null;
  }
}

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

function getOpenid(preferences) {
  const extra = getUserExtraFields(preferences);
  return extra.openid || null;
}

export async function trySendPush({ userId, preferences, payload, task, logPrefix }) {
  const subscription = getPushSubscription(preferences);
  const pushEnabled = shouldSendPush(preferences);
  const openid = getOpenid(preferences);

  let webPushOk = false;
  let wechatOk = false;

  // 1. 尝试 Web Push（浏览器 / PWA 场景）
  if (subscription && pushEnabled) {
    try {
      await sendPushNotification(subscription, payload);
      console.log(`[reminderSender] ${logPrefix} user=${userId} push sent to ${subscription.endpoint?.slice(0, 60)}...`);
      webPushOk = true;
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
    }
  }

  // 2. 同时尝试微信小程序订阅消息（与 Web Push 独立，不互相阻塞）
  if (openid && task) {
    const type = payload.data?.type === "follow_up" ? "follow_up" : "reminder";
    const wechatResult = await sendWechatSubscribeMessage(openid, task, type, payload.body);
    if (wechatResult.ok) {
      console.log(`[reminderSender] ${logPrefix} user=${userId} wechat subscribe sent`);
      wechatOk = true;
    } else if (wechatResult.reason === "user_rejected_or_no_quota") {
      console.log(`[reminderSender] ${logPrefix} user=${userId} wechat subscribe rejected/no quota`);
    } else {
      console.warn(`[reminderSender] ${logPrefix} user=${userId} wechat subscribe failed:`, wechatResult.reason);
    }
  }

  // 任一渠道成功即视为推送成功
  if (webPushOk || wechatOk) {
    return {
      ok: true,
      channel: wechatOk ? "wechat_subscribe" : "web_push",
      webPushOk,
      wechatOk,
    };
  }

  // 3. 兜底：应用内通知
  const reason = !subscription && !openid
    ? "no_push_subscription_or_openid"
    : !pushEnabled
      ? "push_disabled_by_user"
      : "all_channels_failed";
  console.log(`[reminderSender] ${logPrefix} user=${userId} fallback to in-app: ${reason}`);
  await createInAppNotification(
    userId,
    payload.title,
    payload.body,
    { ...payload.data, url: payload.url, fallback_reason: reason }
  );
  return { ok: false, reason, inAppFallback: true };
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
    const extraFields = getTaskExtraFields(task);
    const lastSentAt = extraFields.reminder_sent_at ? new Date(extraFields.reminder_sent_at) : null;
    if (!lastSentAt || isNaN(lastSentAt.getTime())) return true;
    return new Date(task.reminderTime).getTime() > lastSentAt.getTime();
  });

  let sent = 0;
  let skipped = 0;
  let inAppFallback = 0;

  for (const task of dueTasks) {
    const extraFields = getTaskExtraFields(task);
    const st = extraFields.spatiotemporal;
    const weather = await getWeatherContextForUser(task.user?.preferences, task);
    const copy = await buildReminderCopy({
      task,
      kind: "reminder",
      context: {
        location: st?.current_place_name || null,
        timeText: task.reminderTime ? new Date(task.reminderTime).toLocaleString("zh-CN", { hour12: false }) : null,
        weather
      }
    });

    const payload = {
      title: copy.title,
      body: copy.body,
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
      task,
      logPrefix: `start-reminder task=${task.id}`,
    });

    if (result.ok) sent += 1;
    else if (result.inAppFallback) inAppFallback += 1;
    else skipped += 1;

    // 无论发送成功与否，都更新 metadata 里的 reminder_sent_at，避免同一分钟重复尝试
    // 重复约定（每天/每周/每月）：同时把 reminderTime/endTime 推进到下一周期
    const nextReminder = ["daily", "weekly", "monthly", "custom"].includes(extraFields.repeat_rule)
      ? computeNextReminderTime(task.reminderTime, extraFields.repeat_rule, extraFields.custom_recurrence, now)
      : null;
    try {
      const data = { metadata: buildTaskMetadataWithExtra(task, { reminder_sent_at: now.toISOString() }) };
      if (nextReminder) {
        data.reminderTime = nextReminder;
        if (task.endTime) {
          data.endTime = new Date(task.endTime.getTime() + (nextReminder.getTime() - task.reminderTime.getTime()));
        }
        console.log(`[reminderSender] task=${task.id} 重复约定已推进到下一周期 ${nextReminder.toISOString()}`);
      }
      await prisma.task.update({ where: { id: task.id }, data });
    } catch (updateErr) {
      console.warn(`[reminderSender] task=${task.id} failed to update reminder_sent_at:`, updateErr);
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

    const copy = await buildReminderCopy({
      task,
      kind: "follow_up",
      context: {
        timeText: task.endTime ? new Date(task.endTime).toLocaleString("zh-CN", { hour12: false }) : null
      }
    });

    const payload = {
      title: copy.title,
      body: copy.body,
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
      task,
      logPrefix: `end-followup task=${task.id}`,
    });

    if (result.ok) sent += 1;
    else if (result.inAppFallback) inAppFallback += 1;
    else skipped += 1;

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

/**
 * 遗忘对抗提醒：约定过期满一周，或创建满一周仍未完成，自动提醒一次。
 * 依据艾宾浩斯遗忘曲线——一周后记忆留存最低，此时一次提示最能挽回遗忘的约定。
 */
export async function sendForgetReminders() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (!isWebPushConfigured()) {
    console.log("[reminderSender] web push not configured, skipping forget reminders (will still create in-app notifications)");
  }

  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DONE", "ARCHIVED"] },
      OR: [
        { dueAt: { not: null, lte: oneWeekAgo } },
        { createdAt: { lte: oneWeekAgo } }
      ]
    },
    include: { user: { include: { preferences: true } } },
  });

  let sent = 0;
  let skipped = 0;
  let inAppFallback = 0;

  for (const task of candidates) {
    const extra = getTaskExtraFields(task);
    // 每个约定只提醒一次，避免反复打扰
    if (extra.forget_reminder_sent_at) continue;

    const overdueByDue = task.dueAt && task.dueAt <= oneWeekAgo;
    const days = overdueByDue
      ? Math.floor((now.getTime() - task.dueAt.getTime()) / (24 * 60 * 60 * 1000))
      : Math.floor((now.getTime() - task.createdAt.getTime()) / (24 * 60 * 60 * 1000));

    const copy = await buildReminderCopy({ task, kind: "forget", context: { days } });

    const payload = {
      title: copy.title,
      body: copy.body,
      url: `/tasks?id=${task.id}`,
      tag: `forget-${task.id}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { taskId: task.id, type: "forget_reminder" },
    };

    const result = await trySendPush({
      userId: task.userId,
      preferences: task.user.preferences,
      payload,
      task,
      logPrefix: `forget-reminder task=${task.id}`,
    });

    if (result.ok) sent += 1;
    else if (result.inAppFallback) inAppFallback += 1;
    else skipped += 1;

    try {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: buildTaskMetadataWithExtra(task, { forget_reminder_sent_at: now.toISOString() }),
        },
      });
    } catch (updateErr) {
      console.warn(`[reminderSender] task=${task.id} failed to update forget_reminder_sent_at:`, updateErr);
    }
  }

  const result = { sent, skipped, inAppFallback, total: candidates.length };
  if (candidates.length > 0) {
    console.log("[reminderSender] forget reminders:", result);
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
