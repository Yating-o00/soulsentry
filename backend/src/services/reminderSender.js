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

export async function sendDueReminders() {
  if (!isWebPushConfigured()) {
    return { sent: 0, skipped: 0, reason: "web_push_not_configured" };
  }

  const now = new Date();
  // 找提醒时间已到、且未发送过提醒或提醒时间比上次发送时间更新的约定
  // 注意：SQLite 不支持 Prisma 字段比较（prisma.task.fields.reminderTime），
  // 所以先拉候选集，再在内存里做二次过滤。
  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DONE", "ARCHIVED"] },
      reminderTime: { not: null, lte: now }
    },
    include: { user: { include: { preferences: true } } }
  });

  const dueTasks = candidates.filter((task) => {
    if (!task.reminderSentAt) return true;
    return task.reminderTime > task.reminderSentAt;
  });

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const task of dueTasks) {
    const subscription = getPushSubscription(task.user.preferences);
    if (!subscription || !shouldSendPush(task.user.preferences)) {
      skipped += 1;
      continue;
    }

    const payload = {
      title: `约定提醒：${task.title}`,
      body: task.description ? task.description.slice(0, 120) : "您有一个约定到时间了",
      url: `/tasks?id=${task.id}`,
      tag: `reminder-${task.id}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { taskId: task.id, type: "reminder" }
    };

    try {
      await sendPushNotification(subscription, payload);
      sent += 1;
    } catch (err) {
      errors.push({ taskId: task.id, error: err?.message || String(err) });
      // 订阅失效时清理，避免反复报错
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await prisma.userPreference.update({
          where: { userId: task.userId },
          data: {
            metadata: {
              ...(task.user.preferences?.metadata || {}),
              _extraFields: {
                ...getUserExtraFields(task.user.preferences),
                push_subscription: null
              }
            }
          }
        }).catch(() => {});
      }
    } finally {
      // 无论发送成功与否，都更新 reminderSentAt，避免同一分钟重复尝试
      await prisma.task.update({
        where: { id: task.id },
        data: { reminderSentAt: now }
      });
    }
  }

  if (errors.length > 0) {
    console.warn("[reminderSender] push errors:", errors);
  }

  return { sent, skipped, total: dueTasks.length };
}
