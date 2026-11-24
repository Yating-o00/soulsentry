// 协同空间 Agent 自动化：入群欢迎、每日打卡公布。
// 这些动作只使用当前协同空间的数据，不调用 AI 规划、不扣 AI 点数；
// 由空间发起人在 Agent 设置中开启，开启后写入 metadata.collab.agent.settings。
import { schedule } from "node-cron";
import { prisma } from "../lib/prisma.js";
import { collectSubtasks } from "./collabSpace.js";
import { postAgentMessage } from "./collabAgent.js";

export const COLLAB_LANGUAGES = [
  { key: "auto", label: "自动跟随成员" },
  { key: "zh", label: "中文" },
  { key: "en", label: "English" },
  { key: "ja", label: "日本語" },
  { key: "es", label: "Español" },
  { key: "fr", label: "Français" },
];

const LANGUAGE_LABELS = Object.fromEntries(COLLAB_LANGUAGES.map((item) => [item.key, item.label]));

export const DEFAULT_COLLAB_AGENT_SETTINGS = {
  language: "auto",
  welcome: { enabled: false, template: "" },
  checkinDigest: { enabled: false, time: "21:00", mentionMissing: true },
};

const WELCOME_TEMPLATES = {
  zh: "欢迎 @{name} 来到「{task}」！这里的共同目标是：{goal}。先看看讨论和待认领的子约定，有需要随时 @我。",
  en: 'Welcome @{name} to "{task}"! Our shared goal is: {goal}. Take a look at the discussion and open subtasks; tag me anytime.',
  ja: "「{task}」へようこそ、@{name}！共通の目標は「{goal}」です。まずはディスカッションと未担当のサブ約束を見て、必要ならいつでも @ で呼んでください。",
  es: '¡Bienvenido/a @{name} a "{task}"! Nuestro objetivo compartido es: {goal}. Revisa la conversación y las subtareas pendientes; etiquétame cuando quieras.',
  fr: 'Bienvenue @{name} dans « {task} » ! Notre objectif commun : {goal}. Parcourez la discussion et les sous-engagements à prendre, et mentionnez-moi si besoin.',
};

const DIGEST_LABELS = {
  zh: { title: "每日打卡小结", done: "已完成", missing: "还没打卡", latest: "最近记录", none: "今天还没有成员打卡。" },
  en: { title: "Daily check-in summary", done: "Checked in", missing: "Not yet", latest: "Latest", none: "No check-ins from members yet today." },
  ja: { title: "今日のチェックインまとめ", done: "完了", missing: "未完了", latest: "最新", none: "今日はまだメンバーのチェックインがありません。" },
  es: { title: "Resumen diario de check-in", done: "Hecho", missing: "Pendiente", latest: "Último", none: "Todavía no hay check-ins de miembros hoy." },
  fr: { title: "Résumé quotidien des check-ins", done: "Fait", missing: "En attente", latest: "Dernier", none: "Aucun check-in de membre aujourd’hui." },
};

const DEFAULT_DIGEST_TIME = "21:00";
const MAX_WELCOMED_IDS = 200;
const DIGEST_TOPIC = "打卡日报";
const WELCOME_TOPIC = "欢迎";

function displayName(user) {
  return user?.displayName || user?.email || user?.phone || "成员";
}

function safeTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : DEFAULT_DIGEST_TIME;
}

function timeToMinutes(value) {
  const [hour, minute] = safeTime(value).split(":").map(Number);
  return hour * 60 + minute;
}

export function languageLabel(key) {
  return LANGUAGE_LABELS[key] || LANGUAGE_LABELS.zh;
}

export function normalizeAgentSettings(agentMeta = {}) {
  const raw = agentMeta && typeof agentMeta === "object" ? agentMeta : {};
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const welcome = settings.welcome && typeof settings.welcome === "object" ? settings.welcome : {};
  const digest = settings.checkinDigest && typeof settings.checkinDigest === "object" ? settings.checkinDigest : {};
  const language = COLLAB_LANGUAGES.some((item) => item.key === settings.language) ? settings.language : "auto";
  return {
    language,
    welcome: {
      enabled: welcome.enabled === true,
      template: typeof welcome.template === "string" ? welcome.template.slice(0, 800) : "",
    },
    checkinDigest: {
      enabled: digest.enabled === true,
      time: safeTime(digest.time),
      mentionMissing: digest.mentionMissing !== false,
      lastDate: typeof digest.lastDate === "string" ? digest.lastDate : null,
      lastAt: typeof digest.lastAt === "string" ? digest.lastAt : null,
    },
  };
}

function renderVariables(template, vars) {
  return String(template || "").replace(/\{(name|task|goal|members)\}/g, (_, key) => String(vars[key] ?? ""));
}

function welcomeLanguage(settings) {
  return settings.language === "auto" ? "zh" : settings.language;
}

export function renderWelcomeText({ task, member, settings }) {
  const language = welcomeLanguage(settings);
  const name = displayName(member);
  const members = [task.user, ...(task.members || []).map((item) => item.user)]
    .filter(Boolean)
    .map(displayName)
    .filter((item, index, list) => list.indexOf(item) === index)
    .join("、");
  const template = settings.welcome.template?.trim() || WELCOME_TEMPLATES[language] || WELCOME_TEMPLATES.zh;
  let text = renderVariables(template, {
    name,
    task: task.title || "协同约定",
    goal: task.metadata?.collab?.goal || "一起把这件事推进下去",
    members,
  }).trim();
  if (!text.includes(`@${name}`)) {
    text = text.includes(name) ? text.replace(name, `@${name}`) : `@${name} ${text}`;
  }
  return text.slice(0, 1000);
}

async function updateAgentMeta(taskId, updater) {
  const fresh = await prisma.task.findUnique({ where: { id: taskId }, select: { metadata: true } });
  const metadata = fresh?.metadata && typeof fresh.metadata === "object" ? fresh.metadata : {};
  const collab = metadata.collab && typeof metadata.collab === "object" ? metadata.collab : {};
  const agent = collab.agent && typeof collab.agent === "object" ? collab.agent : {};
  const nextAgent = updater(agent);
  await prisma.task.update({
    where: { id: taskId },
    data: { metadata: { ...metadata, collab: { ...collab, agent: nextAgent } } },
  });
}

/**
 * 成员第一次进入协同空间时发送欢迎语。幂等：每个成员在每个空间只欢迎一次。
 * 发起人本人不发送；Agent 暂停或欢迎语未开启时直接跳过。
 */
export async function sendCollabWelcome(taskId, userId) {
  if (!taskId || !userId) return { sent: false, reason: "missing" };
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { members: { include: { user: true } }, user: true },
  });
  const collab = task?.metadata?.collab;
  if (!task || !collab || typeof collab !== "object") return { sent: false, reason: "not_collab" };
  const agent = collab.agent || {};
  if (agent.enabled === false || agent.paused === true) return { sent: false, reason: "agent_off" };
  const settings = normalizeAgentSettings(agent);
  if (!settings.welcome.enabled) return { sent: false, reason: "welcome_off" };
  if (userId === task.userId) return { sent: false, reason: "owner" };
  const membership = (task.members || []).find((item) => item.userId === userId);
  if (!membership?.user) return { sent: false, reason: "not_member" };
  const welcomed = Array.isArray(agent.welcomedUserIds) ? agent.welcomedUserIds : [];
  if (welcomed.includes(userId)) return { sent: false, reason: "already_welcomed" };

  const content = renderWelcomeText({ task, member: membership.user, settings });
  await postAgentMessage(task.id, { content, topic: WELCOME_TOPIC, mentions: [userId] });
  await updateAgentMeta(task.id, (freshAgent) => ({
    ...freshAgent,
    welcomedUserIds: [...(Array.isArray(freshAgent.welcomedUserIds) ? freshAgent.welcomedUserIds : []), userId].slice(-MAX_WELCOMED_IDS),
    lastWelcomeAt: new Date().toISOString(),
  }));
  return { sent: true };
}

function digestLanguage(settings) {
  return settings.language === "auto" ? "zh" : settings.language;
}

export function buildCheckinDigest({ task, members, checkins = [], date, settings }) {
  const language = digestLanguage(settings);
  const labels = DIGEST_LABELS[language] || DIGEST_LABELS.zh;
  const mentionMissing = settings.checkinDigest.mentionMissing !== false;
  const byUser = new Map();
  for (const checkin of checkins) {
    if (!checkin?.userId) continue;
    if (!byUser.has(checkin.userId)) byUser.set(checkin.userId, []);
    byUser.get(checkin.userId).push(checkin);
  }
  const rows = members.map((member) => {
    const list = byUser.get(member.userId) || [];
    return { ...member, count: list.length, last: list[list.length - 1] || null };
  });
  const done = rows.filter((row) => row.count > 0);
  const missing = rows.filter((row) => row.count === 0);
  const doneNames = done.map((row) => row.name).join("、");
  const missingNames = missing
    .map((row) => (mentionMissing ? `@${row.name}` : row.name))
    .join("、");
  const latest = [...done].sort((a, b) => {
    const at = (row) => (row.last?.createdAt ? new Date(row.last.createdAt).getTime() : 0);
    return at(b) - at(a);
  })[0];
  const latestDetail = latest?.last
    ? `${latest.name}${latest.last.note ? `「${String(latest.last.note).slice(0, 60)}」` : latest.last.photoUrl ? "（附了照片）" : ""}`
    : "";
  const lines = [
    `【${labels.title}】${date}`,
    `${labels.done} ${done.length}/${rows.length}${doneNames ? `：${doneNames}` : ""}`,
    `${labels.missing}：${missingNames || "无"}`,
  ];
  if (latestDetail) lines.push(`${labels.latest}：${latestDetail}`);
  if (checkins.length === 0) lines.push(labels.none);
  return {
    content: lines.filter(Boolean).join("\n").slice(0, 1600),
    mentions: mentionMissing ? missing.map((row) => row.userId) : [],
    stats: { total: rows.length, done: done.length, missing: missing.length },
    language,
  };
}

function beijingDayRange(now) {
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const date = bj.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()) - 8 * 3600 * 1000);
  return { date, start, end: new Date(start.getTime() + 86400000), minutes: bj.getUTCHours() * 60 + bj.getUTCMinutes() };
}

export async function sendCheckinDigestForTask(task, now = new Date()) {
  if (!task?.id) return { sent: false, reason: "missing_task" };
  const collab = task.metadata?.collab;
  if (!collab || typeof collab !== "object") return { sent: false, reason: "not_collab" };
  const agent = collab.agent || {};
  if (agent.enabled === false || agent.paused === true) return { sent: false, reason: "agent_off" };
  const settings = normalizeAgentSettings(agent);
  if (!settings.checkinDigest.enabled) return { sent: false, reason: "digest_off" };

  const { date, start, end, minutes } = beijingDayRange(now);
  if (settings.checkinDigest.lastDate === date) return { sent: false, reason: "already_sent" };
  if (minutes < timeToMinutes(settings.checkinDigest.time)) return { sent: false, reason: "not_yet" };

  // 打卡公布面向“协同成员”，发起人自己不需要每天被点名；只统计 TaskMember 里的成员
  const members = (task.members || [])
    .map((item) => item.user)
    .filter(Boolean)
    .map((user) => ({ userId: user.id, name: displayName(user) }))
    .filter((member, index, list) => list.findIndex((item) => item.userId === member.userId) === index);
  if (members.length === 0) return { sent: false, reason: "no_members" };

  const subtasks = await collectSubtasks(task.id);
  const spaceTasks = [task, ...subtasks];
  const checkinTasks = spaceTasks.filter((item) => item.category === "checkin");
  if (checkinTasks.length === 0) return { sent: false, reason: "no_checkin_tasks" };

  const checkins = await prisma.checkin.findMany({
    where: {
      taskId: { in: spaceTasks.map((item) => item.id) },
      createdAt: { gte: start, lt: end },
    },
    orderBy: { createdAt: "asc" },
  });
  const digest = buildCheckinDigest({ task, members, checkins, date, settings });
  await postAgentMessage(task.id, {
    content: digest.content,
    topic: DIGEST_TOPIC,
    mentions: digest.mentions,
  });
  await updateAgentMeta(task.id, (freshAgent) => {
    const freshSettings = normalizeAgentSettings(freshAgent);
    return {
      ...freshAgent,
      settings: {
        ...(freshAgent.settings || {}),
        ...freshSettings,
        checkinDigest: {
          ...freshSettings.checkinDigest,
          lastDate: date,
          lastAt: new Date().toISOString(),
        },
      },
    };
  });
  return { sent: true, ...digest.stats };
}

/**
 * 定时扫描开启了打卡公布的协同空间。每天到达设定时刻后只发一次，
 * 服务重启后如果当天尚未发过，会在下一次 tick 补发。
 */
export async function runCollabCheckinDigests({ now = new Date(), force = false } = {}) {
  const { date, minutes } = beijingDayRange(now);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM Task WHERE deletedAt IS NULL AND metadata IS NOT NULL AND metadata LIKE '%checkinDigest%'`
  );
  const result = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  for (const row of rows.slice(0, 100)) {
    const task = await prisma.task.findUnique({
      where: { id: row.id },
      include: { members: { include: { user: true } }, user: true },
    });
    if (!task) continue;
    result.checked += 1;
    const settings = normalizeAgentSettings(task.metadata?.collab?.agent || {});
    if (!settings.checkinDigest.enabled) {
      result.skipped += 1;
      continue;
    }
    if (settings.checkinDigest.lastDate === date) {
      result.skipped += 1;
      continue;
    }
    if (!force && minutes < timeToMinutes(settings.checkinDigest.time)) {
      result.skipped += 1;
      continue;
    }
    try {
      const sent = await sendCheckinDigestForTask(task, now);
      if (sent.sent) result.sent += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      console.warn(`[collabAutomation] digest failed task=${task.id}:`, error?.message || error);
    }
  }
  return result;
}

let digestCronStarted = false;

export function startCollabCheckinDigestCron() {
  if (digestCronStarted) return;
  digestCronStarted = true;
  schedule("* * * * *", async () => {
    try {
      const result = await runCollabCheckinDigests();
      if (result.sent > 0 || result.failed > 0) console.log("[collabAutomation] checkin digest:", result);
    } catch (error) {
      console.error("[collabAutomation] digest cron failed:", error?.message || error);
    }
  });
  console.log("[collabAutomation] scheduled: daily check-in digest scan every minute");
}
