// 小助手巡检：服务端代替小程序「后台常驻」，定时扫描每个活跃用户的约定状态，
// 发现需要沟通的情况时，以小助手口吻在陪伴对话里留一条主动消息（kind=proactive）。
// 触发信号（按优先级，每轮每用户至多一条）：
//   1. 约定逾期 1 小时以上未完成
//   2. 协同约定有草案只差这位成员勾选确认
//   3. 晚间（20:00–22:30）今日到期约定仍未完成
//   4. 连续 3 天没有完成约定、也没有记录心签（安静关怀）
// 幂等：dedupeKey 唯一约束去重；全局 4 小时冷却防止刷屏；23:00–07:00 静默。
import { prisma } from "../lib/prisma.js";
import { collectSubtasks } from "./collabSpace.js";

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 4 * 3600 * 1000;
const ACTIVE_WINDOW_DAYS = 14;
const SILENCE_DAYS = 3;
const MAX_USERS_PER_SWEEP = 500;

function chinaNow() {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

function chinaDateKey(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function inQuietHours() {
  const h = chinaNow().getUTCHours();
  return h >= 23 || h < 7;
}

const DONE_STATUSES = ["DONE", "ARCHIVED"];

function taskTimeOf(t) {
  return t.reminderTime || t.endTime || t.dueAt || null;
}

async function alreadySent(userId, dedupeKey) {
  const hit = await prisma.companionMessage.findFirst({
    where: { userId, dedupeKey },
    select: { id: true }
  });
  return Boolean(hit);
}

async function sendProactive(user, { dedupeKey, trigger, content }) {
  if (await alreadySent(user.id, dedupeKey)) return false;
  await prisma.companionMessage.create({
    data: {
      userId: user.id,
      role: "assistant",
      content,
      kind: "proactive",
      dedupeKey,
      meta: { trigger }
    }
  });
  console.log(`[companionPatrol] → ${user.displayName || user.id} [${trigger}] ${content.slice(0, 40)}…`);
  return true;
}

function displayName(user) {
  return user.displayName || "你";
}

// 1. 逾期约定：过了约定时间 1 小时以上还没完成
async function triggerOverdue(user, now) {
  const tasks = await prisma.task.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: { notIn: DONE_STATUSES },
      parentTaskId: null
    },
    orderBy: { reminderTime: "asc" },
    take: 50
  });
  const overdue = tasks
    .map((t) => ({ t, at: taskTimeOf(t) }))
    .filter(({ at }) => at && now - new Date(at).getTime() >= 3600 * 1000)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (overdue.length === 0) return null;
  const { t } = overdue[0];
  return {
    dedupeKey: `overdue:${t.id}:${chinaDateKey(now)}`,
    trigger: "overdue",
    content: `「${t.title}」过了约定时间有一会儿了。是遇到什么卡住的地方了吗？跟我说说，或者我帮你把它挪到明天也可以～`
  };
}

// 2. 协同约定：有草案只差这位成员勾选确认
async function triggerCollabPending(user, now) {
  // SQLite 不支持 JSON 路径过滤，取出最近的相关约定后在内存里筛协同空间
  const roots = (await prisma.task.findMany({
    where: {
      deletedAt: null,
      parentTaskId: null,
      OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }]
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    include: { members: true }
  })).filter((t) => t.metadata?.collab && typeof t.metadata.collab === "object");
  for (const root of roots) {
    const memberIds = [...new Set([root.userId, ...root.members.map((m) => m.userId)])];
    if (!memberIds.includes(user.id)) continue;
    const subtasks = await collectSubtasks(root.id);
    const waiting = subtasks.find((s) => {
      const c = s.metadata?.collab;
      if (c?.state !== "draft") return false;
      if (Array.isArray(c.rejectedBy) && c.rejectedBy.includes(user.id)) return false;
      const confirmed = new Set(Array.isArray(c.confirmedBy) ? c.confirmedBy : []);
      return !confirmed.has(user.id);
    });
    if (waiting) {
      return {
        dedupeKey: `collab-pending:${waiting.id}`,
        trigger: "collab_pending",
        content: `协同约定「${root.title}」里的子约定「${waiting.title}」就差你勾选确认了。大家等着它生效，方便的时候看一眼？不同意的话直接勾掉也没关系～`
      };
    }
  }
  return null;
}

// 3. 晚间提醒：20:00–22:30，今天到期的约定还没完成
async function triggerEvening(user, now) {
  const h = chinaNow().getUTCHours();
  if (h < 20 || h >= 22.5) return null;
  const todayKey = chinaDateKey(now);
  const tasks = await prisma.task.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: { notIn: DONE_STATUSES },
      parentTaskId: null
    },
    take: 50
  });
  const dueToday = tasks.filter((t) => {
    const at = taskTimeOf(t);
    return at && chinaDateKey(new Date(at)) === todayKey;
  });
  if (dueToday.length === 0) return null;
  const names = dueToday.slice(0, 2).map((t) => `「${t.title}」`).join("、");
  const more = dueToday.length > 2 ? ` 等 ${dueToday.length} 件` : "";
  return {
    dedupeKey: `evening:${todayKey}`,
    trigger: "evening",
    content: `晚上好。今天的 ${names}${more}还没完成——不用有压力，想做就从最小的那步开始；今天不想做的话，跟我说一声，我帮你挪到明天。`
  };
}

// 4. 安静关怀：连续 3 天没有完成约定、也没有记录；同类关怀 3 天内不重复
async function triggerSilence(user, now, recentProactive = []) {
  const sinceMs = SILENCE_DAYS * 24 * 3600 * 1000;
  const recentSilence = recentProactive.some(
    (m) => m.meta?.trigger === "silence" && now - m.createdAt.getTime() < sinceMs
  );
  if (recentSilence) return null;
  const since = new Date(now.getTime() - sinceMs);
  const [doneCount, noteCount] = await Promise.all([
    prisma.task.count({ where: { userId: user.id, completedAt: { gte: since } } }),
    prisma.note.count({ where: { userId: user.id, createdAt: { gte: since } } })
  ]);
  if (doneCount > 0 || noteCount > 0) return null;
  return {
    dedupeKey: `silence:${chinaDateKey(now)}`,
    trigger: "silence",
    content: `好几天没见你了，最近还好吗？忙也好、累也好，有什么想记的、想定的，随时说给我听，我一直都在。`
  };
}

async function patrolUser(user, now) {
  const recentProactive = await prisma.companionMessage.findMany({
    where: { userId: user.id, kind: "proactive" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, meta: true }
  });
  // 全局冷却：上一条主动消息 4 小时内不再打扰
  if (recentProactive[0] && now - recentProactive[0].createdAt.getTime() < GLOBAL_COOLDOWN_MS) return;

  const triggers = [triggerOverdue, triggerCollabPending, triggerEvening, triggerSilence];
  for (const fn of triggers) {
    try {
      const hit = await fn(user, now, recentProactive);
      if (hit) {
        await sendProactive(user, hit);
        return; // 每轮至多一条，最重要的先说
      }
    } catch (err) {
      console.warn(`[companionPatrol] trigger ${fn.name} failed for ${user.id}:`, err?.message || err);
    }
  }
}

async function sweepOnce() {
  if (inQuietHours()) return;
  const now = new Date();
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 3600 * 1000);
  try {
    // 近 14 天有活动的用户才巡检（有约定/有记录/聊过天）
    const users = await prisma.user.findMany({
      where: {
        role: { not: "ADMIN" },
        OR: [
          { tasks: { some: { createdAt: { gte: activeSince } } } },
          { notes: { some: { createdAt: { gte: activeSince } } } },
          { companionMessages: { some: { createdAt: { gte: activeSince } } } }
        ]
      },
      take: MAX_USERS_PER_SWEEP
    });
    for (const user of users) {
      await patrolUser(user, now).catch((err) => {
        console.warn(`[companionPatrol] user ${user.id} failed:`, err?.message || err);
      });
    }
  } catch (err) {
    console.error("[companionPatrol] sweep failed:", err?.message || err);
  }
}

export function startCompanionPatrol() {
  // 启动后稍等片刻先跑一轮，之后按固定间隔巡检
  setTimeout(() => { sweepOnce(); }, 30 * 1000);
  setInterval(() => { sweepOnce(); }, SWEEP_INTERVAL_MS);
  console.log(`[companionPatrol] 小助手巡检已启动（每 ${SWEEP_INTERVAL_MS / 60000} 分钟一轮）`);
}
