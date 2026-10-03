import { prisma } from "../lib/prisma.js";
import { sendPushNotification, isWebPushConfigured } from "../lib/webPush.js";
import { sendWechatSubscribeMessage } from "../lib/wechatSubscribeMessage.js";
import { computeNextReminderTime } from "../lib/recurrence.js";
import { buildReminderCopy } from "./reminderCopy.js";
import { getWeatherForCoords, weatherContextForReminder } from "./weatherService.js";
import {
  DAILY_REMINDER_BUDGET,
  getDailyReminderUsage,
  nextDailyReminderUsage,
  nextShortSnoozeMinutes,
  isQuietHours,
  overdueDecayStage,
  getHardOverdue
} from "../lib/timeSemantics.js";

// 北京时区的日期串（提醒预算按自然日计数）
function chinaDateStr(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

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

export async function trySendPush({ userId, preferences, payload, task, logPrefix, budgetAware = true }) {
  const subscription = getPushSubscription(preferences);
  const pushEnabled = shouldSendPush(preferences);
  const openid = getOpenid(preferences);

  // 每日主动提醒预算：超限后不再走推送渠道（仅留应用内通知），避免制造心理压力
  const todayStr = chinaDateStr();
  let budgetBlocked = false;
  if (budgetAware && getDailyReminderUsage(preferences, todayStr) >= DAILY_REMINDER_BUDGET) {
    budgetBlocked = true;
    console.log(`[reminderSender] ${logPrefix} user=${userId} daily budget exhausted (${DAILY_REMINDER_BUDGET}), hold push`);
  }

  let webPushOk = false;
  let wechatOk = false;

  // 1. 尝试 Web Push（浏览器 / PWA 场景）
  if (!budgetBlocked && subscription && pushEnabled) {
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
  if (!budgetBlocked && openid && task) {
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

  // 任一渠道成功即视为推送成功，并计入当日预算
  if (webPushOk || wechatOk) {
    if (budgetAware) {
      try {
        await prisma.userPreference.update({
          where: { userId },
          data: {
            metadata: {
              ...(preferences?.metadata || {}),
              _extraFields: {
                ...getUserExtraFields(preferences),
                daily_reminder_usage: nextDailyReminderUsage(preferences, todayStr),
              },
            },
          },
        });
      } catch (e) {
        console.warn("[reminderSender] failed to record daily budget usage:", e?.message || e);
      }
    }
    return {
      ok: true,
      channel: wechatOk ? "wechat_subscribe" : "web_push",
      webPushOk,
      wechatOk,
    };
  }

  // 3. 兜底：应用内通知
  const reason = budgetBlocked
    ? "daily_budget_exceeded"
    : !subscription && !openid
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
  const beijingToday = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  for (const task of dueTasks) {
    const extraFields = getTaskExtraFields(task);
    // 重复约定今天已打卡：不再发送本次提醒，但照常推进排期到下一周期
    const recurrenceDoneToday = ["daily", "weekly", "monthly", "custom"].includes(extraFields.repeat_rule)
      && extraFields.recurrence_last_done === beijingToday;
    const st = extraFields.spatiotemporal;
    const weather = await getWeatherContextForUser(task.user?.preferences, task);
    const copy = recurrenceDoneToday
      ? null
      : await buildReminderCopy({
          task,
          kind: "reminder",
          context: {
            location: st?.current_place_name || null,
            timeText: task.reminderTime ? new Date(task.reminderTime).toLocaleString("zh-CN", { hour12: false }) : null,
            weather
          }
        });

    let result = { ok: false, inAppFallback: false, skipped: recurrenceDoneToday };
    if (!recurrenceDoneToday) {
      const payload = {
        title: copy.title,
        body: copy.body,
        url: `/tasks?id=${task.id}`,
        tag: `reminder-${task.id}`,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: { taskId: task.id, type: "reminder" },
      };

      result = await trySendPush({
        userId: task.userId,
        preferences: task.user.preferences,
        payload,
        task,
        logPrefix: `start-reminder task=${task.id}`,
      });
    }

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

    // 重复约定今天已打卡：窗口结束的温和跟进不再打扰，只记已处理（否则 endTime 未推进会每轮重复挑选）
    const beijingToday = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    if (["daily", "weekly", "monthly", "custom"].includes(extra.repeat_rule)
      && extra.recurrence_last_done === beijingToday) {
      try {
        await prisma.task.update({
          where: { id: task.id },
          data: { metadata: buildTaskMetadataWithExtra(task, { end_reminder_sent_at: new Date().toISOString() }) }
        });
      } catch (err) {
        console.warn(`[reminderSender] task=${task.id} failed to mark end follow-up handled:`, err);
      }
      skipped += 1;
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

/**
 * 短延后序列再提醒：用户点"5分钟后"，到点后用"现在方便处理吗"轻声唤回。
 * 最多两次短延后（5→15分钟），当天不再处理后转入晚间回顾（21:00 一次），深夜静默。
 * 数据约定（tasks.js PATCH 归一化写入）：
 *   snooze_until 延后到点时刻；short_snooze_count 当日短延次数；
 *   snooze_evening_review=true 表示进入晚间回顾；comeback_sent_at 上次处理到的 snooze 时刻（去重）。
 */
export async function sendSnoozeComebacks() {
  const now = new Date();
  if (isQuietHours(now)) return { sent: 0, total: 0, quiet: true };

  // 候选：近期有提醒时间且未完成的约定（snooze 字段在 metadata Json 里，只能内存过滤）
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DONE", "ARCHIVED"] },
      reminderTime: { not: null, gte: twoDaysAgo, lte: new Date(now.getTime() + 60 * 1000) }
    },
    include: { user: { include: { preferences: true } } },
    take: 300
  });

  let sent = 0;
  let inAppFallback = 0;

  for (const task of candidates) {
    const extra = getTaskExtraFields(task);
    const snoozeUntil = extra.snooze_until ? new Date(extra.snooze_until) : null;
    if (!snoozeUntil || isNaN(snoozeUntil.getTime())) continue;
    if (snoozeUntil.getTime() > now.getTime()) continue;
    // 本次 snooze 已处理过（comeback 已发或已转晚间）则跳过
    const comebackAt = extra.comeback_sent_at ? new Date(extra.comeback_sent_at) : null;
    if (comebackAt && !isNaN(comebackAt.getTime()) && comebackAt.getTime() >= snoozeUntil.getTime()) continue;

    const evening = extra.snooze_evening_review === true;
    const shortCount = Number(extra.short_snooze_count || 0);
    // 短延后超过两次（本不应再短延）：直接转晚间回顾，不打扰
    if (!evening && nextShortSnoozeMinutes(shortCount) === null) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: buildTaskMetadataWithExtra(task, {
            comeback_sent_at: now.toISOString(),
            snooze_evening_review: true
          })
        }
      }).catch(() => {});
      continue;
    }

    const copy = evening
      ? {
          title: `晚间回顾 · ${task.title}`,
          body: "今天先放到这里。今晚有空的话，可以花 5 分钟开个头，或把它改到更合适的时间。"
        }
      : {
          title: `现在方便处理「${task.title}」吗？`,
          body: "刚刚你说稍后。如果这 5-20 分钟有空，顺手处理掉它；没空的话再点一次「稍后」或「今天没空」。"
        };

    const payload = {
      title: copy.title,
      body: copy.body,
      url: `/tasks?id=${task.id}`,
      tag: `comeback-${task.id}`,
      requireInteraction: false,
      vibrate: [120, 80, 120],
      data: { taskId: task.id, type: "snooze_comeback" }
    };

    const result = await trySendPush({
      userId: task.userId,
      preferences: task.user.preferences,
      payload,
      task,
      logPrefix: `snooze-comeback task=${task.id}${evening ? " evening" : ""}`
    });
    if (result.ok) sent += 1;
    else if (result.inAppFallback) inAppFallback += 1;

    // 标记本次 snooze 已处理；晚间回顾处理后清除序列，第二天重新计数
    const patch = { comeback_sent_at: now.toISOString() };
    if (evening) {
      patch.snooze_evening_review = false;
      patch.short_snooze_count = 0;
      patch.snooze_until = null;
    }
    await prisma.task.update({
      where: { id: task.id },
      data: { metadata: buildTaskMetadataWithExtra(task, patch) }
    }).catch((e) => console.warn(`[reminderSender] task=${task.id} comeback mark failed:`, e?.message || e));
  }

  const result = { sent, inAppFallback, total: candidates.length };
  if (sent > 0 || inAppFallback > 0) console.log("[reminderSender] snooze comebacks:", result);
  return result;
}

/**
 * 逾期衰减治理：逾期不是需要不断加红的状态，而是需要分级处理：
 * - 1-2 天：提醒一次（温柔）
 * - 3-7 天：问一次"拆小/改期/调整目标"
 * - 8-14 天：静默（不主动推）
 * - 15-30 天：每周回顾一次（移出红色压力区）
 * - >30 天：一次"继续/改项目/归档/删除"决策询问（消除心理债务）
 * 去重：decay_sent_stage 记录已处理等级；weekly_review 额外要求间隔 ≥7 天。
 */
export async function sendOverdueDecayReminders() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["DONE", "ARCHIVED"] },
      OR: [
        { endTime: { not: null, lte: now } },
        { dueAt: { not: null, lte: now } }
      ],
      updatedAt: { gte: thirtyDaysAgo }
    },
    include: { user: { include: { preferences: true } } },
    take: 300
  });

  let sent = 0;
  let inAppFallback = 0;

  for (const task of candidates) {
    const overdue = getHardOverdue(task, now);
    if (!overdue.overdue) continue;
    const stage = overdueDecayStage(overdue.overdueDays);

    const extra = getTaskExtraFields(task);
    const lastStage = extra.decay_sent_stage || null;
    const lastAt = extra.decay_sent_at ? new Date(extra.decay_sent_at) : null;
    if (lastStage === stage && stage !== "weekly_review") continue;
    if (stage === "weekly_review" && lastAt && now.getTime() - lastAt.getTime() < 7 * 24 * 3600 * 1000) continue;
    // low_freq 不主动推（待复盘，只在周回顾出现）
    if (stage === "low_freq") {
      await prisma.task.update({
        where: { id: task.id },
        data: { metadata: buildTaskMetadataWithExtra(task, { decay_sent_stage: stage, decay_sent_at: now.toISOString() }) }
      }).catch(() => {});
      continue;
    }

    const n = overdue.overdueDays;
    const copy =
      stage === "recent"
        ? { title: `「${task.title}」过期 ${n} 天了`, body: "还需要它吗？需要的话挑个 5-15 分钟的小步骤开始；不需要可以改期或归档。" }
        : stage === "reconfirm"
          ? { title: `「${task.title}」已逾期 ${n} 天`, body: "继续硬扛容易一直拖着。要不要：拆成一个 10 分钟小步骤 / 改到本周晚些时候 / 调整目标？" }
          : stage === "weekly_review"
            ? { title: `本周回顾 · ${task.title}`, body: `这件约定已放 ${n} 天。本周回顾时顺便决定：继续做、改成长期项目，还是先归档。` }
            : { title: `「${task.title}」已经 ${n} 天没有推进`, body: "它可能不再是紧急任务。你想：继续并拆小 / 改成每周收集箱 / 下周再回顾 / 暂时归档 / 删除？" };

    const payload = {
      title: copy.title,
      body: copy.body,
      url: `/tasks?id=${task.id}`,
      tag: `decay-${task.id}`,
      requireInteraction: false,
      vibrate: [150, 100, 150],
      data: { taskId: task.id, type: "overdue_decay", stage, overdue_days: n }
    };

    const result = await trySendPush({
      userId: task.userId,
      preferences: task.user.preferences,
      payload,
      task,
      logPrefix: `overdue-decay task=${task.id} stage=${stage}`
    });
    if (result.ok) sent += 1;
    else if (result.inAppFallback) inAppFallback += 1;

    await prisma.task.update({
      where: { id: task.id },
      data: { metadata: buildTaskMetadataWithExtra(task, { decay_sent_stage: stage, decay_sent_at: now.toISOString() }) }
    }).catch((e) => console.warn(`[reminderSender] task=${task.id} decay mark failed:`, e?.message || e));
  }

  const result = { sent, inAppFallback, total: candidates.length };
  if (sent > 0 || inAppFallback > 0) console.log("[reminderSender] overdue decay:", result);
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
