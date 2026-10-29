import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { computeNextReminderTime } from "../lib/recurrence.js";
import { countedCheckinsWhere, VISITOR_CHECKIN_SOURCE } from "../lib/checkinStats.js";
import { syncParentProgress } from "./tasks.js";
import { isDemoUser } from "../lib/ensureDemoUser.js";
import { beijingToday, beijingDayRange } from "../lib/behavior.js";

/**
 * 约定打卡（Checkin）：同一个约定可多次打卡，每次可附带一句话或照片。
 * 打卡是"履约记录"，与"盖章完成"语义独立：打卡不完成约定，完成约定也不删打卡。
 *
 * 开放式打卡约定（category=checkin 且无 end_time）按每日重复约定运转：
 * 打卡 = 记录"今天已打卡"并把已到期的排期滚到下一期（与 tasks.js PATCH 勾选完成的重复语义一致），
 * 到点提醒/核对唤回/顺延唤回见 reminderSender 全链路对 recurrence_last_done 的静默处理。
 */

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

// 打卡后滚存排期：返回给 prisma.task.update 的 data（无重复规则或已带停止时间时返回 null）
function buildRollForwardData(task, now = new Date()) {
  const extra = getTaskExtraFields(task);
  const recurringRule = ["daily", "weekly", "monthly", "custom"].includes(extra.repeat_rule)
    ? extra.repeat_rule
    : (task.category === "checkin" && !task.endTime ? "daily" : null);
  // 有停止时间的打卡约定 = 固定窗口挑战（如 21 天），不滚存，窗口语义保持不变
  if (!recurringRule || task.endTime) return null;

  const chinaToday = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const data = {
    metadata: buildTaskMetadataWithExtra(task, {
      recurrence_last_done: chinaToday,
      recurrence_done_count: Number(extra.recurrence_done_count || 0) + 1,
      // 已打卡：本期核对唤回即刻停止
      recurrence_checkback_anchor: null,
      recurrence_checkback_count: 0
    })
  };
  // 当次提醒时间已过才需要推进；未到点的提醒保留原锚点，送达时由 cron 照常推进（今天已打卡会静默）
  if (task.reminderTime && task.reminderTime.getTime() <= now.getTime()) {
    const nextR = computeNextReminderTime(task.reminderTime, recurringRule, extra.custom_recurrence, now);
    if (nextR) data.reminderTime = nextR;
  }
  return data;
}
export const checkinsRouter = Router();

checkinsRouter.use(requireAuth);

const createSchema = z.object({
  note: z.string().trim().max(500).optional(),
  photo_url: z.string().trim().max(500).optional(),
  source: z.string().trim().max(40).optional(),
}).passthrough();

const patchSchema = z.object({
  note: z.string().trim().max(500).optional(),
  photo_url: z.string().trim().max(500).optional(),
}).passthrough();

function serializeCheckin(c) {
  return {
    id: c.id,
    task_id: c.taskId,
    note: c.note,
    photo_url: c.photoUrl,
    source: c.source,
    created_at: c.createdAt?.toISOString?.() || null,
  };
}

// 约定归属校验：创建者或共有成员可打卡
async function assertCheckinAccess(userId, taskId) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      OR: [{ userId }, { members: { some: { userId } } }],
    },
  });
  return task || null;
}

checkinsRouter.post("/:id/checkins", async (req, res) => {
  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const task = await assertCheckinAccess(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ error: "NOT_FOUND", message: "约定不存在或无权限" });
  // 体验账号是所有人共用的静默会话，不能为别人的约定打卡（避免污染真实用户的累计数据）
  if (task.userId !== req.user.id && isDemoUser(req.user)) {
    return res.status(403).json({ error: "FORBIDDEN", message: "体验账号不能为别人的约定打卡，请先注册登录" });
  }

  // 每日打卡约定：每天只能赴约一次（按北京日期）。当日已打卡后不再产生新记录，
  // 打卡计数只能随天数增长；想收获更多鼓励，分享出去让朋友在落地页「为 TA 加油」。
  const extraFields = task.metadata?._extraFields && typeof task.metadata._extraFields === "object" ? task.metadata._extraFields : {};
  const isDailyRecurrence = extraFields.repeat_rule === "daily"
    || (extraFields.custom_recurrence?.frequency === "daily" && !extraFields.custom_recurrence?.interval);
  if (isDailyRecurrence) {
    const todayStr = beijingToday();
    let alreadyCounted = extraFields.recurrence_last_done === todayStr;
    if (!alreadyCounted) {
      const [start, end] = beijingDayRange(todayStr);
      const todayCount = await prisma.checkin.count({
        where: { taskId: task.id, source: { not: VISITOR_CHECKIN_SOURCE }, createdAt: { gte: start, lt: end } }
      });
      alreadyCounted = todayCount > 0;
    }
    if (alreadyCounted) {
      return res.status(409).json({
        error: "ALREADY_CHECKED_TODAY",
        message: "今日已赴约，明天再打卡～想收获更多鼓励，分享出去让朋友为你加油"
      });
    }
  }

  const checkin = await prisma.checkin.create({
    data: {
      userId: req.user.id,
      taskId: task.id,
      note: parsed.data.note || null,
      photoUrl: parsed.data.photo_url || null,
      source: parsed.data.source || "manual",
    },
  });

  const total = await prisma.checkin.count({ where: countedCheckinsWhere(task.id) });
  const first = await prisma.checkin.findFirst({
    where: { taskId: task.id },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  // 行为日志：驱动"全设备智能协同"等个性化分析
  try {
    await prisma.userBehavior.create({
      data: {
        userId: req.user.id,
        eventType: "checkin_created",
        taskId: task.id,
        hourOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        category: task.category,
        metadata: { total, has_note: !!parsed.data.note, has_photo: !!parsed.data.photo_url },
      },
    });
  } catch (e) {
    console.warn("[checkins] behavior log failed:", e?.message || e);
  }

  // 开放式重复打卡约定：打卡即"今天已打卡"，排期滚到下一期（失败不阻断打卡响应）
  try {
    const rollForwardData = buildRollForwardData(task);
    if (rollForwardData) {
      await prisma.task.update({ where: { id: task.id }, data: rollForwardData });
    }
  } catch (e) {
    console.warn("[checkins] recurrence roll-forward failed:", e?.message || e);
  }

  // 智能规划的打卡子约定（单日固定窗口）：打卡即完成当次——置 DONE 并回算父约定进度。
  // 开放式打卡约定没有父约定、不带 plan_kind，走上面的滚存逻辑，互不影响。
  try {
    const extra = getTaskExtraFields(task);
    if (task.parentTaskId && extra.plan_kind === "checkin" && task.status !== "DONE") {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "DONE", completedAt: new Date() },
      });
      await syncParentProgress(task.parentTaskId);
    }
  } catch (e) {
    console.warn("[checkins] plan child complete failed:", e?.message || e);
  }

  return res.status(201).json({
    ...serializeCheckin(checkin),
    total,
    first_at: first?.createdAt?.toISOString?.() || null,
  });
});

checkinsRouter.get("/:id/checkins", async (req, res) => {
  const task = await assertCheckinAccess(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ error: "NOT_FOUND", message: "约定不存在或无权限" });

  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const [todayStart, todayEnd] = beijingDayRange(beijingToday());
  const [items, total, first, cheerTotal, todayCount] = await Promise.all([
    prisma.checkin.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.checkin.count({ where: countedCheckinsWhere(task.id) }),
    prisma.checkin.findFirst({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    // 鼓励数据：分享落地页访客"为 TA 加油"的累计（打卡卡片展示）
    prisma.cheer.count({ where: { taskId: task.id } }),
    // 今日是否已赴约（每日打卡约定一天一次，前端据此显示「今日已赴约」并禁用打卡）
    prisma.checkin.count({
      where: { taskId: task.id, source: { not: VISITOR_CHECKIN_SOURCE }, createdAt: { gte: todayStart, lt: todayEnd } },
    }),
  ]);

  return res.json({
    total,
    first_at: first?.createdAt?.toISOString?.() || null,
    cheer_total: cheerTotal,
    done_today: todayCount > 0,
    items: items.map(serializeCheckin),
  });
});

// 补记：打卡后给当次记录附加想法/照片（点完打卡再写也行）
checkinsRouter.patch("/:id/checkins/:checkinId", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const task = await assertCheckinAccess(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ error: "NOT_FOUND", message: "约定不存在或无权限" });

  const existing = await prisma.checkin.findFirst({
    where: { id: req.params.checkinId, taskId: task.id },
  });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "打卡记录不存在" });

  const checkin = await prisma.checkin.update({
    where: { id: existing.id },
    data: {
      note: parsed.data.note !== undefined ? parsed.data.note : existing.note,
      photoUrl: parsed.data.photo_url !== undefined ? parsed.data.photo_url : existing.photoUrl,
    },
  });

  return res.json(serializeCheckin(checkin));
});
