// 协同空间 Agent 自动化：入群欢迎、每日打卡公布。
// 这些动作只使用当前协同空间的数据，不调用 AI 规划、不扣 AI 点数；
// 由空间发起人在 Agent 设置中开启，开启后写入 metadata.collab.agent.settings。
import { schedule } from "node-cron";
import { prisma } from "../lib/prisma.js";
import { callKimiChat, FAST_TEXT_MODELS, parseModelJson } from "../lib/kimi.js";
import { collectSubtasks } from "./collabSpace.js";
import { formatSpaceData, loadSpaceSnapshot, postAgentMessage } from "./collabAgent.js";

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
const MAX_CUSTOM_RULES = 10;
const DIGEST_TOPIC = "打卡日报";
const WELCOME_TOPIC = "欢迎";
const CUSTOM_RULE_TOPIC = "自动提醒";

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
    customRules: (Array.isArray(settings.customRules) ? settings.customRules : [])
      .map((item, index) => normalizeCustomRule(item, index))
      .filter(Boolean)
      .slice(0, MAX_CUSTOM_RULES),
  };
}

export function normalizeCustomRule(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const instruction = String(source.instruction || "").trim().slice(0, 600);
  if (!instruction) return null;
  const mode = source.mode === "instruction" ? "instruction" : "schedule";
  const frequency = ["daily", "weekly", "monthly"].includes(source.frequency) ? source.frequency : "daily";
  const weekday = Math.min(7, Math.max(1, Number(source.weekday) || 1));
  const day = Math.min(31, Math.max(1, Number(source.day) || 1));
  const language = COLLAB_LANGUAGES.some((item) => item.key === source.language) ? source.language : "auto";
  return {
    id: String(source.id || `rule_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`).slice(0, 60),
    name: String(source.name || "自定义功能").trim().slice(0, 24) || "自定义功能",
    enabled: source.enabled !== false,
    mode,
    frequency,
    time: safeTime(source.time || "09:00"),
    weekday,
    day,
    condition: String(source.condition || "").trim().slice(0, 300),
    instruction,
    language,
    lastRunKey: typeof source.lastRunKey === "string" ? source.lastRunKey : null,
    lastRunAt: typeof source.lastRunAt === "string" ? source.lastRunAt : null,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
    sourceText: typeof source.sourceText === "string" ? source.sourceText.slice(0, 600) : "",
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

// ── 自定义空间管理功能：自然语言 → 规则；定时规则由 Agent 结合空间数据执行 ──

const WEEKDAY_CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const WEEKDAY_LABELS = ["", "一", "二", "三", "四", "五", "六", "日"];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseClockText(text) {
  const plain = String(text || "");
  const hm = plain.match(/\b([01]?\d|2[0-3])[:：]([0-5]\d)\b/);
  if (hm) return `${pad2(Number(hm[1]))}:${hm[2]}`;
  const match = plain.match(/(早上|上午|中午|下午|傍晚|晚上|晚间|夜里)?\s*(\d{1,2})\s*(?:点|时)(?:\s*(\d{1,2})\s*分?)?/);
  if (!match) return null;
  let hour = Number(match[2]);
  const period = match[1] || "";
  if (/下午|傍晚|晚上|晚间|夜里/.test(period) && hour < 12) hour += 12;
  if (/中午/.test(period) && hour < 11) hour += 12;
  if (hour > 23) return null;
  return `${pad2(hour)}:${pad2(Number(match[3] || 0))}`;
}

export function customRuleScheduleLabel(rule) {
  if (!rule || rule.mode === "instruction") return "对话时";
  if (rule.frequency === "weekly") return `每周${WEEKDAY_LABELS[rule.weekday] || "一"} ${rule.time}`;
  if (rule.frequency === "monthly") return `每月${rule.day}日 ${rule.time}`;
  return `每天 ${rule.time}`;
}

export function fallbackParseCustomRule(text, settings = {}) {
  const source = String(text || "").trim().slice(0, 600);
  const weekly = source.match(/(?:每周|每星期)\s*([一二三四五六日天1-7])/);
  const monthly = source.match(/(?:每月|每个月)\s*(\d{1,2})\s*[日号]/);
  const daily = /(每天|每日|每晚|天天)/.test(source);
  const clock = parseClockText(source);
  const hasCondition = /(当|如果|一旦|有人|成员|连续|超过|没有|没|未)/.test(source)
    && /(提醒|通知|公布|汇总|跟进|催|统计|整理|私信|发)/.test(source);
  const schedule = Boolean(weekly || monthly || daily || clock || hasCondition);
  const frequency = weekly ? "weekly" : monthly ? "monthly" : "daily";
  const weekday = weekly ? (WEEKDAY_CN[weekly[1]] || Number(weekly[1]) || 1) : 1;
  const day = monthly ? Math.min(31, Math.max(1, Number(monthly[1]) || 1)) : 1;
  const time = clock || (hasCondition ? "21:00" : "09:00");
  const cleaned = source
    .replace(/^(帮我|请|麻烦|以后|记得)/, "")
    .replace(/[，。,.!?！？；;：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const rule = normalizeCustomRule({
    name: cleaned.slice(0, 18) || "自定义功能",
    mode: schedule ? "schedule" : "instruction",
    frequency,
    time,
    weekday,
    day,
    condition: hasCondition ? source : "",
    instruction: source,
    language: settings.language === "auto" ? "auto" : settings.language,
    sourceText: source,
  });
  return rule;
}

export async function parseCustomRuleWithAI(text, { task, settings } = {}) {
  const source = String(text || "").trim().slice(0, 600);
  const fallback = fallbackParseCustomRule(source, settings);
  if (!source) return fallback;
  try {
    const systemPrompt = `你是心栈协同 Agent 的规则编译器。把创建者的自然语言需求变成一条可执行的群管理规则，只输出 JSON：
{"name":"≤12字","mode":"schedule|instruction","frequency":"daily|weekly|monthly","time":"HH:MM","weekday":1-7,"day":1-31,"condition":"可选的触发条件","instruction":"完整执行要求","language":"auto|zh|en|ja|es|fr"}
规则：
- 明确出现每天/每周/每月/几点/具体时刻 → mode=schedule，frequency 和 time 按原意填写；每周默认周一，每月默认1日。
- 没有固定时间，但描述“当/如果/一旦/有人…/连续…/没…时”才触发 → mode=schedule, frequency=daily, time=21:00，condition 写清触发条件。
- 没有时间也没有触发条件，只是让 Agent 以后按某种方式沟通/整理 → mode=instruction。
- 保留用户意图和对象，不要添加用户没说的功能；语言默认 auto，除非用户明确指定。
- time 用 24 小时制 HH:MM。`;
    const prompt = `协同空间：${task?.title || "协同约定"}
共同目标：${task?.metadata?.collab?.goal || "未填写"}
空间语言：${settings?.language || "auto"}
用户需求：${source}`;
    const result = await callKimiChat({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      responseJsonSchema: { name: "collab_custom_rule" },
      models: FAST_TEXT_MODELS,
      temperature: 0.3,
      maxTokens: 800,
      fetchTimeout: 12000,
    });
    const data = parseModelJson(result.content);
    return normalizeCustomRule({ ...data, sourceText: source }, 0) || fallback;
  } catch (error) {
    console.warn("[collabAutomation] custom rule parse fallback:", error?.message || error);
    return fallback;
  }
}

function beijingRuleParts(now) {
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const date = bj.toISOString().slice(0, 10);
  const weekday = ((bj.getUTCDay() + 6) % 7) + 1; // 周一=1
  const monday = new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate() - (weekday - 1)));
  return {
    date,
    month: date.slice(0, 7),
    weekday,
    mondayKey: monday.toISOString().slice(0, 10),
    day: bj.getUTCDate(),
    minutes: bj.getUTCHours() * 60 + bj.getUTCMinutes(),
  };
}

export function customRulePeriodKey(rule, now = new Date()) {
  const parts = beijingRuleParts(now);
  if (rule.frequency === "weekly") return parts.mondayKey;
  if (rule.frequency === "monthly") return parts.month;
  return parts.date;
}

export function isCustomRuleDue(rule, now = new Date(), { force = false } = {}) {
  if (!rule || rule.enabled === false || rule.mode === "instruction") return false;
  const parts = beijingRuleParts(now);
  if (!force && parts.minutes < timeToMinutes(rule.time)) return false;
  if (rule.frequency === "weekly" && parts.weekday !== rule.weekday) return false;
  if (rule.frequency === "monthly" && parts.day !== rule.day) return false;
  return rule.lastRunKey !== customRulePeriodKey(rule, now);
}

async function markCustomRuleRun(taskId, ruleId, key) {
  await updateAgentMeta(taskId, (agent) => {
    const current = normalizeAgentSettings(agent);
    return {
      ...agent,
      settings: {
        ...(agent.settings || {}),
        ...current,
        customRules: current.customRules.map((rule) =>
          rule.id === ruleId ? { ...rule, lastRunKey: key, lastRunAt: new Date().toISOString() } : rule
        ),
      },
    };
  });
}

async function executeCustomRule(task, rule, settings, now) {
  const snapshot = await loadSpaceSnapshot(task);
  const spaceText = formatSpaceData(task, snapshot).slice(0, 5000);
  const members = [task.user, ...(task.members || []).map((item) => item.user)]
    .filter(Boolean)
    .map((user) => ({ userId: user.id, name: displayName(user) }))
    .filter((member, index, list) => list.findIndex((item) => item.userId === member.userId) === index);
  let checkinText = "";
  if (/(打卡|签到|check.?in)/i.test(`${rule.condition} ${rule.instruction}`)) {
    const subtasks = await collectSubtasks(task.id);
    const checkinTaskIds = [task.id, ...subtasks.filter((item) => item.category === "checkin").map((item) => item.id)];
    const { date, start, end } = beijingDayRange(now);
    const checkins = await prisma.checkin.findMany({
      where: { taskId: { in: checkinTaskIds }, createdAt: { gte: start, lt: end } },
    });
    const counts = members
      .map((member) => `${member.name} ${checkins.filter((item) => item.userId === member.userId).length}次`)
      .join("；");
    checkinText = `今日打卡（${date}）：${counts || "暂无"}`;
  }
  const language = rule.language === "auto" ? (settings.language === "auto" ? "zh" : settings.language) : rule.language;
  const systemPrompt = `你是心栈协同空间 Agent。创建者设置了一条自动功能，请严格按规则执行。只使用给出的空间数据，不编造；条件不满足时不要打扰群。
只输出 JSON：{"action":"post|skip","content":"要发到群里的内容（≤200字，群聊口吻，可 @ 成员，开头带功能名【...】）"}。`;
  const prompt = `当前北京时间：${beijingRuleParts(now).date} ${pad2(Math.floor(beijingRuleParts(now).minutes / 60))}:${pad2(beijingRuleParts(now).minutes % 60)}
功能名称：${rule.name}
执行计划：${customRuleScheduleLabel(rule)}
触发条件：${rule.condition || "无，到点直接执行"}
要做什么：${rule.instruction}
使用语言：${languageLabel(language)}
${checkinText}
空间数据：
${spaceText}

如果触发条件为空，直接生成；如果条件不满足，返回 skip。`;
  try {
    const result = await callKimiChat({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      responseJsonSchema: { name: "collab_custom_rule_result" },
      models: FAST_TEXT_MODELS,
      temperature: 0.4,
      maxTokens: 1000,
      fetchTimeout: 15000,
    });
    const data = parseModelJson(result.content);
    const content = String(data?.content || "").trim();
    if (data?.action !== "post" || !content) return { posted: false };
    await postAgentMessage(task.id, { content: content.slice(0, 1200), topic: CUSTOM_RULE_TOPIC });
    return { posted: true };
  } catch (error) {
    // 无条件提醒在 AI 不可用时仍按规则原文发出；有条件规则宁可不打扰
    if (!rule.condition) {
      const fallback = `【${rule.name}】${rule.instruction}`.slice(0, 800);
      await postAgentMessage(task.id, { content: fallback, topic: CUSTOM_RULE_TOPIC });
      return { posted: true, fallback: true };
    }
    throw error;
  }
}

/**
 * 扫描开启了自定义定时功能的协同空间。每条规则每个周期最多执行一次；
 * 执行失败或条件不满足也标记本期已处理，避免每分钟反复调用 AI。
 */
export async function runCollabCustomRules({ now = new Date(), force = false } = {}) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM Task WHERE deletedAt IS NULL AND metadata IS NOT NULL AND metadata LIKE '%customRules%'`
  );
  const result = { checked: 0, posted: 0, skipped: 0, failed: 0 };
  let budget = 20;
  for (const row of rows.slice(0, 100)) {
    if (budget <= 0) break;
    const task = await prisma.task.findUnique({
      where: { id: row.id },
      include: { members: { include: { user: true } }, user: true },
    });
    if (!task) continue;
    const agent = task.metadata?.collab?.agent;
    if (!agent || agent.enabled === false || agent.paused === true) continue;
    const settings = normalizeAgentSettings(agent);
    const dueRules = settings.customRules.filter((rule) => isCustomRuleDue(rule, now, { force })).slice(0, 5);
    if (dueRules.length === 0) {
      result.skipped += 1;
      continue;
    }
    result.checked += 1;
    for (const rule of dueRules) {
      if (budget <= 0) break;
      budget -= 1;
      const key = customRulePeriodKey(rule, now);
      try {
        const outcome = await executeCustomRule(task, rule, settings, now);
        if (outcome.posted) result.posted += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        console.warn(`[collabAutomation] custom rule failed task=${task.id} rule=${rule.id}:`, error?.message || error);
      } finally {
        // 无论成功、跳过还是失败，都标记本期已处理，避免每分钟重复调用
        await markCustomRuleRun(task.id, rule.id, key).catch((error) => {
          console.warn("[collabAutomation] mark custom rule failed:", error?.message || error);
        });
      }
    }
  }
  return result;
}

let customRuleCronStarted = false;

export function startCollabCustomRuleCron() {
  if (customRuleCronStarted) return;
  customRuleCronStarted = true;
  schedule("* * * * *", async () => {
    try {
      const result = await runCollabCustomRules();
      if (result.posted > 0 || result.failed > 0) console.log("[collabAutomation] custom rules:", result);
    } catch (error) {
      console.error("[collabAutomation] custom rule cron failed:", error?.message || error);
    }
  });
  console.log("[collabAutomation] scheduled: custom rules scan every minute");
}
