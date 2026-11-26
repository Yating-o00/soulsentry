import { runAiTaskContext } from "../lib/aiContext.js";
// 小助手巡检：服务端代替小程序「后台常驻」，定时扫描每个活跃用户的约定状态，
// 发现需要沟通的情况时，以小助手口吻在陪伴对话里留一条主动消息（kind=proactive）。
// 触发信号（按优先级，每轮每用户至多一条）：
//   1. 约定逾期 1 小时以上未完成
//   2. 协同约定有草案只差这位成员勾选确认
//   3. 晚间（20:00–22:30）今日到期约定仍未完成
//   4. 连续 3 天没有完成约定、也没有记录心签（安静关怀）
// 幂等与节制：dedupeKey 唯一约束去重；同一件事（matterKey）用户没接话就只提醒一次，
// 接话后同一件事也至少隔 24h 再提；全局 6 小时冷却防止刷屏；23:00–07:00 静默。
import { prisma } from "../lib/prisma.js";
import { collectSubtasks } from "./collabSpace.js";
import { invokeKimiText } from "../lib/kimi.js";

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 6 * 3600 * 1000; // 全局冷却：上一条主动消息 6 小时内不再打扰
const MATTER_RECUR_MS = 24 * 3600 * 1000;   // 同一件事用户接了话之后，再次提醒的最小间隔
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

async function sendProactive(user, { dedupeKey, trigger, matterKey, content }) {
  if (await alreadySent(user.id, dedupeKey)) return false;
  await prisma.companionMessage.create({
    data: {
      userId: user.id,
      role: "assistant",
      content,
      kind: "proactive",
      dedupeKey,
      meta: { trigger, matterKey }
    }
  });
  console.log(`[companionPatrol] proactive message saved [${trigger}]`);
  return true;
}

/**
 * 同一件事只提醒一次：查这件事（matterKey）上次提醒后用户有没有接话——
 * 没接话：不再重复提醒（回到对话里那条还在）；
 * 接了话：视为「在继续讨论」，间隔 24h 以上才允许再次提醒。
 */
async function shouldRemindMatter(userId, matterKey, now) {
  if (!matterKey) return true;
  const lastSame = await prisma.companionMessage.findFirst({
    where: { userId, kind: "proactive", dedupeKey: { startsWith: matterKey } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  if (!lastSame) return true;
  const engaged = await prisma.companionMessage.findFirst({
    where: { userId, role: "user", createdAt: { gt: lastSame.createdAt } },
    select: { id: true }
  });
  if (!engaged) return false;
  return now - lastSame.createdAt.getTime() >= MATTER_RECUR_MS;
}

function displayName(user) {
  return user.displayName || "你";
}

const PERSONA_TONES = {
  gentle: "温柔陪伴型——轻声细语，永远先接住情绪，不催促、不评判。",
  strict: "严格督学型——目标导向，语气温和但直接；用户未完成时帮他找原因而不是一味安慰。",
  buddy: "战友互卷型——像并肩作战的朋友，轻松幽默，多用「我们」「一起」。",
};

async function loadPersonaTone(userId) {
  try {
    const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { metadata: true } });
    return PERSONA_TONES[pref?.metadata?._extraFields?.persona] || PERSONA_TONES.gentle;
  } catch (_e) {
    return PERSONA_TONES.gentle;
  }
}

// 模板只提供事实草稿——最终话术由 AI 按人格重写，并避开最近发过的内容，防止聊天记录里每天雷同
async function polishContent(userId, { trigger, draft, recentTexts }) {
  try {
    const personaTone = await loadPersonaTone(userId);
    const avoid = (recentTexts || []).slice(0, 6).map((t) => t.slice(0, 60));
    const data = await invokeKimiText({
      systemPrompt: `你是心栈 SoulSentry 的小助手，人格：${personaTone}你正在主动给用户发一条关怀消息。要求：口语、真诚、80 字以内、不喊口号、不带列表；避开最近发过的角度和措辞（换说法、换切入点），但事实信息必须保留。只输出 JSON：{"text":"..."}`,
      prompt: `场景：${trigger}。\n草稿（事实以此为准）：${draft}\n\n最近发过的消息（不要雷同）：${avoid.length ? avoid.join(" ｜ ") : "无"}`,
      responseJsonSchema: true,
      maxTokens: 300,
      fetchTimeout: 15000,
    });
    const text = String(data?.text || "").trim();
    // 与近三条完全相同的宁可不发重写版，回退草稿（dedupeKey 仍保证同事件不重复）
    if (text && text.length <= 140 && !avoid.includes(text)) return text;
  } catch (err) {
    console.warn(`[companionPatrol] polish failed, fallback to draft:`, err?.message || err);
  }
  return draft;
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
  const matterKey = `overdue:${t.id}`;
  return {
    dedupeKey: `${matterKey}:${chinaDateKey(now)}`,
    matterKey,
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
      const matterKey = `collab-pending:${waiting.id}`;
      return {
        dedupeKey: matterKey, // 同一草案只提醒一次
        matterKey,
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
  // 事项键带上约定 id：换了一批约定就是新的事，可以再次提醒；同一批只提醒一次
  const ids = dueToday.map((t) => t.id).sort().join(",").slice(0, 120);
  const matterKey = `evening:${ids}`;
  return {
    dedupeKey: `${matterKey}:${todayKey}`,
    matterKey,
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
    matterKey: "silence",
    trigger: "silence",
    content: `好几天没见你了，最近还好吗？忙也好、累也好，有什么想记的、想定的，随时说给我听，我一直都在。`
  };
}

async function patrolUser(user, now) {
  const recentProactive = await prisma.companionMessage.findMany({
    where: { userId: user.id, kind: "proactive" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, meta: true, content: true }
  });
  // 全局冷却：上一条主动消息 4 小时内不再打扰
  if (recentProactive[0] && now - recentProactive[0].createdAt.getTime() < GLOBAL_COOLDOWN_MS) return;

  const recentTexts = recentProactive.map((m) => m.content).filter(Boolean);
  const triggers = [triggerOverdue, triggerCollabPending, triggerEvening, triggerSilence];
  for (const fn of triggers) {
    try {
      const hit = await fn(user, now, recentProactive);
      if (!hit) continue;
      // 同一件事：用户没接话就只提醒一次；接了话也要隔 24h 再提
      if (!(await shouldRemindMatter(user.id, hit.matterKey, now))) continue;
      const content = await polishContent(user.id, { trigger: hit.trigger, draft: hit.content, recentTexts });
      await sendProactive(user, { ...hit, content });
      return { businessSuccess: content !== hit.content, used_fallback: content === hit.content }; // 每轮至多一条
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
      await runAiTaskContext("companion.patrol", () => patrolUser(user, now)).catch((err) => {
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
