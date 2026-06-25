import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { invokeKimiText, invokeKimiWebSearch } from "../lib/kimi.js";
<<<<<<< HEAD
import { env } from "../config/env.js";
=======
import { prisma } from "../lib/prisma.js";
>>>>>>> 8338621 (feat: 呈现产品页面)
import { analyzeIntentWithKimi } from "../services/analyzeIntent.js";
import { getCreditPack } from "../config/creditPacks.js";
import { createWechatNativeOrder, generateOutTradeNo, getWechatMerchantConfig, queryWechatOrder as wechatQueryOrder } from "../lib/wechatPay.js";
import { markWechatOrderPaid } from "../services/wechatOrders.js";

export const functionsRouter = Router();

functionsRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

<<<<<<< HEAD
function getPreferenceExtraFields(preferences) {
  if (preferences?.metadata && isPlainObject(preferences.metadata)) {
    const extraFields = preferences.metadata._extraFields;
    if (isPlainObject(extraFields)) {
      return extraFields;
    }
  }
  return {};
}

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2
    + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getTaskExtraFields(task) {
  if (isPlainObject(task?.metadata?._extraFields)) {
    return task.metadata._extraFields;
  }
  return {};
}

function getTaskLocationReminder(task) {
  const extraFields = getTaskExtraFields(task);
  const reminder = extraFields.location_reminder;
  return isPlainObject(reminder) ? reminder : null;
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function buildDailyBriefingTitle(displayName) {
  const now = new Date();
  const hour = now.getHours();
  const period = hour < 12 ? "早安" : hour < 18 ? "午后" : "晚间";
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${displayName || "旅行者"}的${period}心栈·${month}月${day}日`;
}

async function generateDailyBriefingForUser(user) {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  const tasks = await prisma.task.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }],
    take: 300
  });

  const activeTasks = tasks.filter((t) => t.status !== "DONE" && t.status !== "ARCHIVED");
  const urgentTasks = activeTasks.filter((t) => t.priority === "urgent" || t.priority === "high");
  const overdueTasks = activeTasks.filter((t) => t.endTime && new Date(t.endTime) < now);
  const todayDueTasks = activeTasks.filter((t) => {
    const candidate = t.dueAt || t.endTime || t.reminderTime;
    if (!candidate) return false;
    const dt = new Date(candidate);
    return dt >= todayStart && dt <= todayEnd;
  });

  const recentCompleted = tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt))
    .slice(0, 5);

  const topTitles = urgentTasks.slice(0, 3).map((t) => `「${t.title}」`).join("、");
  const shortTerm = (() => {
    if (activeTasks.length === 0) return "今天没有待办任务，适合把精力留给恢复与长期目标。";
    if (urgentTasks.length > 0) return `优先推进 ${topTitles}。把需要快速反馈的事项先收口，再处理常规任务。`;
    if (todayDueTasks.length > 0) return `今天有 ${todayDueTasks.length} 项需要关注的到期/提醒任务，建议先完成最容易推进的一项来启动节奏。`;
    if (overdueTasks.length > 0) return `有 ${overdueTasks.length} 项任务已超过预期时间，挑选其中影响最大的先做一次“降阻/改期”处理。`;
    return `你当前有 ${activeTasks.length} 项活跃任务，建议用一个 25 分钟专注块推进最关键的一项。`;
  })();

  const longTerm = (() => {
    if (recentCompleted.length > 0) {
      const names = recentCompleted.slice(0, 2).map((t) => `「${t.title}」`).join("、");
      return `你最近完成了 ${names}。保持这个节奏，把“重要但不紧急”的事项也安排进日程里。`;
    }
    return "给未来留一点空间：把本周最重要的目标写下来，并为它预留一个稳定的固定时段。";
  })();

  const mindful = urgentTasks.length > 0
    ? "先做最重要的一件事，其他事会自动变轻。"
    : "慢一点也没关系，重要的是方向正确。";

  return {
    title: buildDailyBriefingTitle(user.displayName),
    short_term_narrative: shortTerm,
    long_term_narrative: longTerm,
    mindful_tip: mindful,
    task_stats: {
      active: activeTasks.length,
      urgent: urgentTasks.length,
      overdue: overdueTasks.length,
      today_due: todayDueTasks.length,
      recent_completed: recentCompleted.length
    }
  };
}

function getGeofencePreset(locationType) {
  const presets = {
    home: { radius: 180, quiet_minutes: 45 },
    office: { radius: 220, quiet_minutes: 30 },
    gym: { radius: 120, quiet_minutes: 60 },
    school: { radius: 180, quiet_minutes: 45 },
    shopping: { radius: 150, quiet_minutes: 30 },
    hospital: { radius: 220, quiet_minutes: 90 },
    restaurant: { radius: 120, quiet_minutes: 20 },
    other: { radius: 200, quiet_minutes: 30 }
  };
  return presets[String(locationType || "other")] || presets.other;
}

function decodeXmlEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value = "") {
  return decodeXmlEntities(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function pickXmlValue(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const matched = String(block || "").match(regex);
  return matched ? decodeXmlEntities(matched[1]).trim() : "";
}

function pickXmlLink(block) {
  const attributeMatch = String(block || "").match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (attributeMatch?.[1]) {
    return decodeXmlEntities(attributeMatch[1]).trim();
  }
  return stripHtml(pickXmlValue(block, "link"));
}

function parseRssItems(xmlText = "") {
  const blocks = String(xmlText).match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map((block) => {
    const title = stripHtml(pickXmlValue(block, "title"));
    const link = pickXmlLink(block);
    const description = stripHtml(
      pickXmlValue(block, "description")
      || pickXmlValue(block, "summary")
      || pickXmlValue(block, "content")
      || pickXmlValue(block, "content:encoded")
    );
    const pubDate = stripHtml(
      pickXmlValue(block, "pubDate")
      || pickXmlValue(block, "published")
      || pickXmlValue(block, "updated")
    );
    return {
      title,
      link,
      summary: description.slice(0, 280),
      published_at: pubDate || null
    };
  }).filter((item) => item.title && item.link);
}

function buildExternalVisionCards(feed, items = []) {
  return items.slice(0, 3).map((item, index) => ({
    id: `${feed.id}:${index}:${item.link}`,
    type: feed.feedType === "rss" ? "subscription" : "expansion",
    title: item.title,
    summary: item.summary || `${feed.name} 的最新更新`,
    source: feed.name,
    url: item.link,
    relevance: feed.description || "",
    published_at: item.published_at || null
  }));
}

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(value) {
  if (typeof value !== "string" || !YMD_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDaysYmd(value, offset) {
  const base = parseYmd(value) || new Date();
  base.setDate(base.getDate() + offset);
  return toYmd(base);
}

function normalizeDateString(value, fallback) {
  const direct = typeof value === "string" ? value.trim() : "";
  if (direct && YMD_PATTERN.test(direct)) return direct;
  const fb = typeof fallback === "string" ? fallback.trim() : "";
  if (fb && YMD_PATTERN.test(fb)) return fb;
  return toYmd(new Date());
}

function parseJsonLoose(value) {
  if (!value) return value;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  if (!(text.startsWith("{") || text.startsWith("["))) return value;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return value;
  }
}

function getWeekDates(startDate) {
  const start = parseYmd(startDate) || new Date();
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(toYmd(d));
  }
  return dates;
}

function normalizeWeekEvent(event, weekDates) {
  if (!isPlainObject(event)) return null;
  const title = typeof event.title === "string" ? event.title.trim() : "";
  if (!title) return null;

  const dayIndex = Number.isFinite(Number(event.day_index)) ? Number(event.day_index) : null;
  const dateCandidate = typeof event.date === "string" ? event.date.trim() : "";
  const date = YMD_PATTERN.test(dateCandidate)
    ? dateCandidate
    : dayIndex !== null && weekDates[dayIndex]
      ? weekDates[dayIndex]
      : weekDates[0];

  const timeText = typeof event.time === "string" && event.time.trim() ? event.time.trim() : "09:00";
  const typeText = typeof event.type === "string" && event.type.trim() ? event.type.trim() : "other";
  const iconText = typeof event.icon === "string" && event.icon.trim() ? event.icon.trim().slice(0, 8) : "📅";

  return {
    date,
    day_index: dayIndex !== null ? Math.max(0, Math.min(6, dayIndex)) : undefined,
    title: title.slice(0, 160),
    time: timeText.slice(0, 10),
    type: typeText.slice(0, 40),
    icon: iconText,
    description: typeof event.description === "string" ? event.description.slice(0, 500) : ""
  };
}

function normalizeWeekPlan(raw, startDate, existingPlan) {
  const data = parseJsonLoose(raw);
  const base = isPlainObject(data) ? data : {};
  const weekDates = getWeekDates(startDate);

  const events = Array.isArray(base.events)
    ? base.events.map((item) => normalizeWeekEvent(item, weekDates)).filter(Boolean)
    : [];

  const automations = Array.isArray(base.automations)
    ? base.automations
        .map((item) => (isPlainObject(item) ? item : null))
        .filter(Boolean)
        .map((item) => ({
          title: typeof item.title === "string" ? item.title.slice(0, 160) : "自动执行",
          description: typeof item.description === "string" ? item.description.slice(0, 500) : "",
          icon: typeof item.icon === "string" ? item.icon.slice(0, 8) : "⚙️",
          status: typeof item.status === "string" ? item.status : "pending"
        }))
    : [];

  const rawStrategies = isPlainObject(base.device_strategies) ? base.device_strategies : {};
  const device_strategies = {
    phone: rawStrategies.phone ?? rawStrategies.mobile ?? rawStrategies.smartphone ?? "",
    watch: rawStrategies.watch ?? "",
    pc: rawStrategies.pc ?? rawStrategies.desktop ?? "",
    car: rawStrategies.car ?? "",
    home: rawStrategies.home ?? "",
    glasses: rawStrategies.glasses ?? ""
  };

  const statsRaw = isPlainObject(base.stats) ? base.stats : {};
  const focusHours = Number(statsRaw.focus_hours);
  const meetings = Number(statsRaw.meetings);
  const travelDays = Number(statsRaw.travel_days);

  return {
    ...base,
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    theme: typeof base.theme === "string" ? base.theme.slice(0, 120) : (existingPlan?.theme || ""),
    summary: typeof base.summary === "string" ? base.summary.slice(0, 1600) : (existingPlan?.summary || ""),
    events,
    automations,
    device_strategies,
    stats: {
      focus_hours: Number.isFinite(focusHours) ? focusHours : 0,
      meetings: Number.isFinite(meetings) ? meetings : 0,
      travel_days: Number.isFinite(travelDays) ? travelDays : 0
=======
function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeDateString(value, fallbackDate) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }
  }

  return fallbackDate;
}

function getWeekDates(startDate) {
  const base = new Date(`${startDate}T00:00:00+08:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setDate(base.getDate() + index);
    return `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`;
  });
}

function getMonthWeekStarts(startDate) {
  const base = new Date(`${startDate}T00:00:00+08:00`);
  const starts = [];
  for (let week = 0; week < 4; week += 1) {
    const current = new Date(base);
    current.setDate(base.getDate() + (week * 7));
    starts.push(`${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`);
  }
  return starts;
}

function normalizeWeekEvent(event, weekDates) {
  if (!isPlainObject(event) || !event.title) return null;

  const normalizedDate = normalizeDateString(
    event.date,
    typeof event.day_index === "number" ? weekDates[Math.max(0, Math.min(6, event.day_index))] : weekDates[0]
  );
  const dayIndex = Math.max(0, weekDates.indexOf(normalizedDate));

  return {
    date: normalizedDate,
    day_index: dayIndex >= 0 ? dayIndex : 0,
    title: String(event.title).slice(0, 120),
    time: typeof event.time === "string" && /^\d{2}:\d{2}$/.test(event.time) ? event.time : "09:00",
    end_time: typeof event.end_time === "string" && /^\d{2}:\d{2}$/.test(event.end_time) ? event.end_time : undefined,
    is_all_day: Boolean(event.is_all_day),
    type: ["work", "meeting", "travel", "focus", "rest", "other"].includes(event.type) ? event.type : "other",
    icon: typeof event.icon === "string" && event.icon.trim() ? event.icon.trim().slice(0, 4) : "📅",
    description: typeof event.description === "string" ? event.description.slice(0, 240) : undefined
  };
}

function normalizeWeekPlan(rawPlan, startDate, existingPlan) {
  const weekDates = getWeekDates(startDate);
  const base = isPlainObject(rawPlan) ? rawPlan : {};
  const existing = isPlainObject(existingPlan) ? existingPlan : {};
  const eventsSource = Array.isArray(base.events) && base.events.length > 0
    ? base.events
    : (Array.isArray(existing.events) ? existing.events : []);
  const automationsSource = Array.isArray(base.automations) && base.automations.length > 0
    ? base.automations
    : (Array.isArray(existing.automations) ? existing.automations : []);

  return {
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    summary: String(base.summary || existing.summary || "本周围绕核心目标推进，兼顾专注、协作与恢复。").slice(0, 300),
    theme: String(base.theme || existing.theme || "本周聚焦").slice(0, 80),
    events: eventsSource.map((item) => normalizeWeekEvent(item, weekDates)).filter(Boolean),
    device_strategies: isPlainObject(base.device_strategies)
      ? base.device_strategies
      : (isPlainObject(existing.device_strategies) ? existing.device_strategies : {
        phone: "工作时段开启专注模式，集中处理即时沟通。",
        watch: "在会议、通勤和健康提醒场景提供轻量提示。",
        pc: "深度工作块优先处理核心任务，减少切换。"
      }),
    automations: automationsSource.map((item) => ({
      title: String(item?.title || "自动化提醒").slice(0, 100),
      description: String(item?.description || "根据周计划自动提醒与整理重点事项。").slice(0, 240),
      icon: typeof item?.icon === "string" && item.icon.trim() ? item.icon.trim().slice(0, 4) : "⚙️",
      status: item?.status === "active" ? "active" : "pending"
    })),
    stats: {
      focus_hours: Number(base?.stats?.focus_hours ?? existing?.stats?.focus_hours ?? 12),
      meetings: Number(base?.stats?.meetings ?? existing?.stats?.meetings ?? 2),
      travel_days: Number(base?.stats?.travel_days ?? existing?.stats?.travel_days ?? 0)
>>>>>>> a4f998e (feat: 呈现产品页面)
    }
  };
}

function buildWeekFallbackPlan(input, startDate, existingPlan) {
  const weekDates = getWeekDates(startDate);
<<<<<<< HEAD
  return {
    is_demo: true,
    plan_start_date: startDate,
    theme: existingPlan?.theme || "演示周计划",
    summary: "AI 服务暂时不可用，已生成演示规划（不影响保存与后续编辑）。",
    events: [
      {
        date: weekDates[0],
        day_index: 0,
        title: "梳理本周三件最重要的事",
        time: "09:30",
        type: "focus",
        icon: "🎯",
        description: String(input || "").slice(0, 200)
      }
    ],
    automations: [
      { title: "每日晨间提醒", description: "09:00 触发今日三件事复盘", icon: "⏰", status: "pending" }
    ],
    device_strategies: {
      phone: "提醒安排：根据日程自动推送关键任务与出行提醒。",
      watch: "用短震动提示到点事项，避免打断深度工作。",
      pc: "工作时段集中显示待办与会议摘要，减少切屏。",
      car: "",
      home: "",
      glasses: ""
    },
    stats: { focus_hours: 6, meetings: 2, travel_days: 0 }
  };
}

async function generateWeekPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, payload.currentDate);

  const schema = {
    type: "object",
    properties: {
      plan_start_date: { type: "string" },
      theme: { type: "string" },
      summary: { type: "string" },
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            day_index: { type: "number" },
            title: { type: "string" },
            time: { type: "string" },
            type: { type: "string" },
            icon: { type: "string" },
            description: { type: "string" }
          },
          required: ["date", "title", "time", "type", "icon"]
        }
      },
      device_strategies: { type: "object" },
      automations: { type: "array" },
      stats: { type: "object" }
    },
    required: ["plan_start_date", "theme", "summary", "events", "device_strategies"]
  };
=======
  const keywords = String(input || "");
  const events = [];

  if (/出差|飞|机场|高铁|酒店/.test(keywords)) {
    events.push({ date: weekDates[1], day_index: 1, title: "差旅与行程确认", time: "09:00", type: "travel", icon: "✈️" });
  }
  if (/会议|汇报|沟通|对接|拜访/.test(keywords)) {
    events.push({ date: weekDates[2], day_index: 2, title: "关键会议与沟通", time: "14:00", type: "meeting", icon: "👥" });
  }
  if (/跑步|健身|锻炼|体检|休息|作息/.test(keywords)) {
    events.push({ date: weekDates[4], day_index: 4, title: "健康与恢复安排", time: "18:30", type: "rest", icon: "💪" });
  }
  if (/发布|上线|研发|开发|复盘|学习|阅读|备考/.test(keywords) || events.length === 0) {
    events.unshift({ date: weekDates[0], day_index: 0, title: "深度专注推进核心事项", time: "09:30", type: "focus", icon: "🎯" });
    events.push({ date: weekDates[3], day_index: 3, title: "中段检查与调整", time: "16:00", type: "work", icon: "🧭" });
  }

  return normalizeWeekPlan({
    plan_start_date: startDate,
    summary: `已根据输入生成基础周计划：${String(input || "").slice(0, 40) || "围绕本周重点推进核心安排"}。`,
    theme: /出差|会议/.test(keywords) ? "协同推进周" : "专注推进周",
    events,
    automations: [
      { title: "每日重点回顾", description: "每天晚上回顾当日推进情况并整理明日重点。", icon: "✨", status: "active" }
    ],
    stats: {
      focus_hours: events.filter((item) => item.type === "focus" || item.type === "work").length * 3,
      meetings: events.filter((item) => item.type === "meeting").length,
      travel_days: events.filter((item) => item.type === "travel").length
    }
  }, startDate, existingPlan);
}

function normalizeMonthlyPlan(rawPlan, startDate, existingPlan) {
  const base = isPlainObject(rawPlan) ? rawPlan : {};
  const existing = isPlainObject(existingPlan) ? existingPlan : {};
  const milestonesSource = Array.isArray(base.key_milestones) && base.key_milestones.length > 0
    ? base.key_milestones
    : (Array.isArray(existing.key_milestones) ? existing.key_milestones : []);
  const weeksSource = Array.isArray(base.weeks_breakdown) && base.weeks_breakdown.length > 0
    ? base.weeks_breakdown
    : (Array.isArray(existing.weeks_breakdown) ? existing.weeks_breakdown : []);

  return {
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    summary: String(base.summary || existing.summary || "本月以关键目标拆解、节奏推进和阶段复盘为主。").slice(0, 400),
    theme: String(base.theme || existing.theme || "月度蓝图").slice(0, 80),
    key_milestones: milestonesSource.map((item, index) => ({
      title: String(item?.title || `里程碑 ${index + 1}`).slice(0, 120),
      deadline: normalizeDateString(item?.deadline, startDate),
      type: String(item?.type || "milestone").slice(0, 40)
    })),
    weeks_breakdown: weeksSource.map((item, index) => ({
      week_label: String(item?.week_label || `第 ${index + 1} 周`).slice(0, 40),
      focus: String(item?.focus || "推进当周重点").slice(0, 120),
      key_events: Array.isArray(item?.key_events) ? item.key_events.slice(0, 6).map((entry) => String(entry).slice(0, 120)) : []
    })),
    strategies: isPlainObject(base.strategies)
      ? base.strategies
      : (isPlainObject(existing.strategies) ? existing.strategies : {
        focus: "前中后段分别对应启动、推进、收口。",
        balance: "每周保留恢复和复盘窗口，避免全月透支。"
      }),
    stats: {
      focus_hours: Number(base?.stats?.focus_hours ?? existing?.stats?.focus_hours ?? 36),
      milestones_count: Number(base?.stats?.milestones_count ?? existing?.stats?.milestones_count ?? milestonesSource.length ?? 3)
    }
  };
}

function buildMonthFallbackPlan(input, startDate, existingPlan) {
  const weekStarts = getMonthWeekStarts(startDate);
  const keywords = String(input || "");
  const milestones = [
    { title: "明确月度目标与优先级", deadline: weekStarts[0], type: "goal" },
    { title: "完成核心事项中段检查", deadline: weekStarts[2], type: "review" },
    { title: "月底总结与复盘", deadline: weekStarts[3], type: "review" }
  ];

  if (/上线|发布|交付/.test(keywords)) {
    milestones.unshift({ title: "完成发布前准备", deadline: weekStarts[1], type: "launch" });
  }
  if (/考试|学习|读书|训练/.test(keywords)) {
    milestones.push({ title: "完成本月阶段学习成果", deadline: weekStarts[3], type: "milestone" });
  }

  return normalizeMonthlyPlan({
    plan_start_date: startDate,
    summary: `已根据输入生成基础月度蓝图：${String(input || "").slice(0, 50) || "聚焦本月核心目标与节奏安排"}。`,
    theme: /提升|学习|习惯/.test(keywords) ? "成长提升月" : "目标推进月",
    key_milestones: milestones,
    weeks_breakdown: [
      { week_label: "第 1 周", focus: "明确目标与拆解动作", key_events: ["梳理优先级", "建立执行节奏"] },
      { week_label: "第 2 周", focus: "集中推进核心事项", key_events: ["安排深度工作块", "同步关键协作"] },
      { week_label: "第 3 周", focus: "检查进度与修正路径", key_events: ["做一次中期复盘", "补齐风险项"] },
      { week_label: "第 4 周", focus: "收口交付与总结复盘", key_events: ["完成交付", "整理复盘"] }
    ],
    strategies: {
      focus: "把月目标拆到每周，避免一次性压到月底。",
      balance: "在高强度推进之外预留恢复与缓冲空间。"
    },
    stats: {
      focus_hours: 40,
      milestones_count: milestones.length
    }
  }, startDate, existingPlan);
}

async function generateWeekPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, normalizeDateString(payload.currentDate, new Date().toISOString().slice(0, 10)));
>>>>>>> a4f998e (feat: 呈现产品页面)

  try {
    const data = await invokeKimiText({
      systemPrompt: [
        "你是一名中文周计划规划助手。",
        `当前查看周起始日期（周一）是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "请返回完整周计划，而不是片段。",
        "events 中每条都要包含：date(YYYY-MM-DD)、day_index(0-6)、title、time(HH:MM)、type、icon。",
        "device_strategies 至少包含 phone/watch/pc 三项。",
        "automations 仅保留 1-4 条最有价值的自动化动作。"
      ].join("\n"),
<<<<<<< HEAD
      prompt: String(payload.input || "").trim(),
      responseJsonSchema: schema,
      model: payload.model,
      temperature: payload.temperature
=======
      prompt: [
        `用户输入：${payload.input || ""}`,
        payload.existingPlan ? `现有周计划（如需追加，请返回合并后的完整版本）：${JSON.stringify(payload.existingPlan)}` : "",
        `今天日期：${payload.currentDate || startDate}`
      ].filter(Boolean).join("\n\n"),
      responseJsonSchema: {
        type: "object",
        properties: {
          plan_start_date: { type: "string" },
          summary: { type: "string" },
          theme: { type: "string" },
          events: { type: "array" },
          device_strategies: { type: "object" },
          automations: { type: "array" },
          stats: { type: "object" }
        },
        required: ["summary", "events"]
      },
      temperature: 0.4
>>>>>>> a4f998e (feat: 呈现产品页面)
    });

    return normalizeWeekPlan(data, startDate, payload.existingPlan);
  } catch (_error) {
    return buildWeekFallbackPlan(payload.input, startDate, payload.existingPlan);
  }
}

<<<<<<< HEAD
function normalizeMonthPlan(raw, monthStartDate, existingPlan) {
  const data = parseJsonLoose(raw);
  const base = isPlainObject(data) ? data : {};

  const strategies = isPlainObject(base.strategies) ? base.strategies : {};
  const key_milestones = Array.isArray(base.key_milestones)
    ? base.key_milestones
        .map((m) => (isPlainObject(m) ? m : null))
        .filter(Boolean)
        .map((m) => ({
          title: typeof m.title === "string" ? m.title.slice(0, 200) : "里程碑",
          type: typeof m.type === "string" ? m.type : "milestone",
          deadline: normalizeDateString(m.deadline, monthStartDate)
        }))
    : [];

  const weeks_breakdown = Array.isArray(base.weeks_breakdown)
    ? base.weeks_breakdown
        .map((w) => (isPlainObject(w) ? w : null))
        .filter(Boolean)
        .map((w, idx) => ({
          week_label: typeof w.week_label === "string" ? w.week_label.slice(0, 40) : `第 ${idx + 1} 周`,
          focus: typeof w.focus === "string" ? w.focus.slice(0, 120) : "",
          key_events: Array.isArray(w.key_events)
            ? w.key_events.filter((e) => typeof e === "string" && e.trim()).map((e) => e.slice(0, 80)).slice(0, 8)
            : []
        }))
    : [];

  const statsRaw = isPlainObject(base.stats) ? base.stats : {};
  const focusHours = Number(statsRaw.focus_hours);
  const milestonesCount = Number(statsRaw.milestones_count);

  return {
    ...base,
    plan_start_date: normalizeDateString(base.plan_start_date, monthStartDate),
    theme: typeof base.theme === "string" ? base.theme.slice(0, 120) : (existingPlan?.theme || ""),
    summary: typeof base.summary === "string" ? base.summary.slice(0, 2000) : (existingPlan?.summary || ""),
    strategies,
    key_milestones,
    weeks_breakdown,
    stats: {
      focus_hours: Number.isFinite(focusHours) ? focusHours : 0,
      milestones_count: Number.isFinite(milestonesCount) ? milestonesCount : key_milestones.length
    }
  };
}

function buildMonthFallbackPlan(input, monthStartDate, existingPlan) {
  return {
    is_demo: true,
    plan_start_date: monthStartDate,
    theme: existingPlan?.theme || "演示月计划",
    summary: "AI 服务暂时不可用，已生成演示规划（不影响保存与后续编辑）。",
    strategies: {
      focus: "先完成最关键的一项交付，其余保持低摩擦推进。",
      rhythm: "每周保留 2 个深度专注块，周末做一次复盘。"
    },
    key_milestones: [
      { title: "确认本月目标与范围", type: "milestone", deadline: addDaysYmd(monthStartDate, 2) }
    ],
    weeks_breakdown: [
      { week_label: "第 1 周", focus: "打底与拆解", key_events: ["明确目标", "列出关键交付"] },
      { week_label: "第 2 周", focus: "集中推进", key_events: ["深度工作块", "阶段验收"] },
      { week_label: "第 3 周", focus: "收口与修正", key_events: ["补齐短板", "预演输出"] },
      { week_label: "第 4 周", focus: "发布与复盘", key_events: ["交付", "复盘"] }
    ],
    stats: { focus_hours: 32, milestones_count: 1 },
    original_input: String(input || "").slice(0, 800)
  };
}

async function generateMonthPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, payload.currentDate);

  const schema = {
    type: "object",
    properties: {
      plan_start_date: { type: "string" },
      theme: { type: "string" },
      summary: { type: "string" },
      strategies: { type: "object" },
      key_milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: { type: "string" },
            deadline: { type: "string" }
          },
          required: ["title", "type", "deadline"]
        }
      },
      weeks_breakdown: {
        type: "array",
        items: {
          type: "object",
          properties: {
            week_label: { type: "string" },
            focus: { type: "string" },
            key_events: { type: "array", items: { type: "string" } }
          },
          required: ["week_label", "focus"]
        }
      },
      stats: { type: "object" }
    },
    required: ["plan_start_date", "theme", "summary", "weeks_breakdown"]
  };
=======
async function generateMonthPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, new Date().toISOString().slice(0, 10));
>>>>>>> a4f998e (feat: 呈现产品页面)

  try {
    const data = await invokeKimiText({
      systemPrompt: [
<<<<<<< HEAD
        "你是一名中文月度目标拆解与节奏规划助手。",
        `当前规划月份起始日期（YYYY-MM-DD）是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "weeks_breakdown 需要给出 4-6 周的节奏，每周包含 week_label、focus、key_events(0-6条)。",
        "key_milestones 给出 1-6 个关键里程碑，包含 title/type/deadline(YYYY-MM-DD)。",
        "stats 至少包含 focus_hours、milestones_count。",
      ].join("\n"),
      prompt: String(payload.input || "").trim(),
      responseJsonSchema: schema,
      model: payload.model,
      temperature: payload.temperature
    });

    return normalizeMonthPlan(data, startDate, payload.existingPlan);
=======
        "你是一名中文月度规划助手。",
        `当前查看月份起始日期是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "请返回完整月度蓝图。",
        "key_milestones 返回 3-6 个关键里程碑。",
        "weeks_breakdown 返回 4-5 周拆解，每周包含 week_label、focus、key_events。"
      ].join("\n"),
      prompt: [
        `用户输入：${payload.input || ""}`,
        Array.isArray(payload.behaviors) && payload.behaviors.length > 0
          ? `近期待观察到的行为样本：${JSON.stringify(payload.behaviors.slice(0, 20))}`
          : "",
        payload.existingPlan ? `现有月计划（如需追加，请返回合并后的完整版本）：${JSON.stringify(payload.existingPlan)}` : ""
      ].filter(Boolean).join("\n\n"),
      responseJsonSchema: {
        type: "object",
        properties: {
          plan_start_date: { type: "string" },
          summary: { type: "string" },
          theme: { type: "string" },
          key_milestones: { type: "array" },
          weeks_breakdown: { type: "array" },
          strategies: { type: "object" },
          stats: { type: "object" }
        },
        required: ["summary", "key_milestones", "weeks_breakdown"]
      },
      temperature: 0.4
    });

    return normalizeMonthlyPlan(data, startDate, payload.existingPlan);
>>>>>>> a4f998e (feat: 呈现产品页面)
  } catch (_error) {
    return buildMonthFallbackPlan(payload.input, startDate, payload.existingPlan);
  }
}

functionsRouter.post("/:name", async (req, res) => {
  const { name } = req.params;
  const payload = req.body || {};

  try {
    if (name === "invokeKimi") {
      if (Array.isArray(payload.file_urls) && payload.file_urls.length > 0) {
        return res.status(501).json({
          error: "FILE_INPUT_NOT_IMPLEMENTED",
          message: "独立后端当前仅支持纯文本 Kimi 调用，文件上传与附件抽取尚未迁移"
        });
      }

      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json(data);
    }

    if (name === "kimiWebBrowse") {
      const data = await invokeKimiWebSearch({
        query: payload.query,
        language: payload.language
      });

      return res.json(data);
    }

    if (name === "analyzeIntent") {
      const data = await analyzeIntentWithKimi({
        input: payload.input,
        date: payload.date,
        existingPlan: payload.existingPlan
      });

      return res.json(data);
    }

    if (name === "callAI") {
      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json({
        data,
        balance: req.user.aiCredits
      });
    }

<<<<<<< HEAD
    if (name === "getVapidPublicKey") {
      return res.json({
        publicKey: env.VAPID_PUBLIC_KEY || null
      });
    }

    if (name === "generateDailyBriefing") {
      return res.json(await generateDailyBriefingForUser(req.user));
    }

=======
>>>>>>> a4f998e (feat: 呈现产品页面)
    if (name === "generateWeekPlan") {
      if (!payload.input || !String(payload.input).trim()) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少周计划输入内容" });
      }

      return res.json(await generateWeekPlan(payload));
    }

    if (name === "generateMonthPlan") {
      if (!payload.input || !String(payload.input).trim()) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少月计划输入内容" });
      }

      return res.json(await generateMonthPlan(payload));
    }

<<<<<<< HEAD
<<<<<<< HEAD
    if (name === "savePushSubscription") {
      const existingPreferences = await prisma.userPreference.findUnique({
        where: { userId: req.user.id }
      });

      const previousExtraFields = getPreferenceExtraFields(existingPreferences);
      const nextExtraFields = {
        ...previousExtraFields,
        push_subscription: payload.subscription || null,
        push_user_agent: payload.user_agent || previousExtraFields.push_user_agent || null,
        push_enabled: Boolean(payload.subscription)
      };

      const nextMetadata = {
        ...(isPlainObject(existingPreferences?.metadata) ? existingPreferences.metadata : {}),
        _extraFields: nextExtraFields
      };

      const preference = await prisma.userPreference.upsert({
        where: { userId: req.user.id },
        update: {
          pushNotifications: payload.subscription ? true : false,
          metadata: nextMetadata
        },
        create: {
          userId: req.user.id,
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          pushNotifications: payload.subscription ? true : false,
          metadata: nextMetadata
        }
      });

      return res.json({
        ok: true,
        subscribed: Boolean(payload.subscription),
        preference_id: preference.id
      });
    }

    if (name === "suggestGeofenceParams") {
      const preset = getGeofencePreset(payload.location_type);
      return res.json({
        radius: payload.radius || preset.radius,
        quiet_minutes: payload.quiet_minutes || preset.quiet_minutes,
        latitude: typeof payload.latitude === "number" ? payload.latitude : undefined,
        longitude: typeof payload.longitude === "number" ? payload.longitude : undefined,
        resolved_address: payload.address || payload.name || "",
        source: "standalone-heuristic"
      });
    }

    if (name === "geofenceTrigger") {
      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const reminders = tasks
        .map((task) => {
          const locationReminder = getTaskLocationReminder(task);
          if (!locationReminder?.enabled) return null;
          if (typeof locationReminder.latitude !== "number" || typeof locationReminder.longitude !== "number") return null;

          const distance = haversineMeters(
            { latitude: payload.latitude, longitude: payload.longitude },
            { latitude: locationReminder.latitude, longitude: locationReminder.longitude }
          );

          const radius = Number(locationReminder.radius || 200);
          if (distance > radius) return null;

          return {
            task_id: task.id,
            title: task.title,
            distance: Math.round(distance),
            location_name: locationReminder.location_name || "目标地点",
            trigger_on: locationReminder.trigger_on || "enter"
          };
        })
        .filter(Boolean);

      return res.json({ reminders });
    }

    if (name === "nearbyTaskMatcher") {
      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const matches = tasks
        .map((task) => {
          const locationReminder = getTaskLocationReminder(task);
          if (!locationReminder?.enabled) return null;
          if (typeof locationReminder.latitude !== "number" || typeof locationReminder.longitude !== "number") return null;

          const distance = haversineMeters(
            { latitude: payload.latitude, longitude: payload.longitude },
            { latitude: locationReminder.latitude, longitude: locationReminder.longitude }
          );

          const radius = Number(locationReminder.radius || 200);
          if (distance > Math.max(radius, 400)) return null;

          return {
            task_id: task.id,
            title: task.title,
            distance: Math.round(distance),
            location_name: locationReminder.location_name || "附近地点",
            priority: task.priority
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

      return res.json({
        matched: matches.length > 0,
        matches,
        card: matches[0] || null
      });
    }

    if (name === "sentinelGeofenceTrigger") {
      const locations = await prisma.savedLocation.findMany({
        where: {
          userId: req.user.id,
          isActive: true
        }
      });

      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const results = [];

      for (const location of locations) {
        const distance = haversineMeters(
          { latitude: payload.latitude, longitude: payload.longitude },
          { latitude: location.latitude, longitude: location.longitude }
        );

        if (distance > location.radius) continue;

        const linkedTask = tasks.find((task) => {
          const locationReminder = getTaskLocationReminder(task);
          return locationReminder?.enabled && locationReminder.location_name === location.name;
        });

        if (!linkedTask) continue;

        results.push({
          event: "enter",
          level: "standard",
          location_name: location.name,
          task_id: linkedTask.id,
          task_title: linkedTask.title,
          context_summary: `${linkedTask.title} 已进入 ${location.name} 附近可提醒范围`,
          distance: Math.round(distance)
        });
      }

      return res.json({ results });
    }

    if (name === "getSentinelGuard") {
      return res.json({
        success: true,
        geo_context: null,
        forgetting_rescue: null,
        generated_at: new Date().toISOString()
      });
    }

    if (name === "getAssociationRecommendations") {
      return res.json({
        success: true,
        sequential_recommendation: null,
        location_pattern: null,
        rules_count: 0,
        generated_at: new Date().toISOString()
      });
    }

    if (name === "fetchExternalFeeds") {
      const feed = await prisma.externalFeed.findFirst({
        where: {
          id: payload.feed_id,
          userId: req.user.id
        }
      });

      if (!feed) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: "外部信息源不存在"
        });
      }

      if (!feed.url) {
        return res.status(400).json({
          error: "INVALID_FEED",
          message: "该信息源缺少 URL"
        });
      }

      const response = await fetch(feed.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 SoulSentry/1.0"
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        return res.status(502).json({
          error: "FETCH_FAILED",
          message: `拉取失败：${response.status}`
        });
      }

      const xmlText = await response.text();
      const items = parseRssItems(xmlText);
      const now = new Date();

      let archived = 0;
      if (feed.autoArchiveToHeartsign) {
        for (const item of items.slice(0, 10)) {
          const duplicate = await prisma.note.findFirst({
            where: {
              userId: req.user.id,
              sourceType: "external_feed",
              plainText: `${item.title} ${item.summary}`.slice(0, 1000)
            }
          });

          if (duplicate) continue;

          await prisma.note.create({
            data: {
              userId: req.user.id,
              title: item.title.slice(0, 200),
              content: `**${item.title}**\n\n${item.summary}\n\n来源：${feed.name}\n链接：${item.link}`,
              plainText: `${item.title} ${item.summary}`.slice(0, 1000),
              sourceType: "external_feed",
              aiStatus: "pending",
              tags: ["外部信息", feed.name]
            }
          });
          archived += 1;
        }
      }

      await prisma.externalFeed.update({
        where: { id: feed.id },
        data: {
          lastFetchedAt: now,
          lastItemCount: items.length,
          metadata: {
            ...(isPlainObject(feed.metadata) ? feed.metadata : {}),
            latest_items: items.slice(0, 10)
          }
        }
      });

      return res.json({
        fetched: items.length,
        archived,
        feed_id: feed.id
      });
    }

    if (name === "getExternalVision") {
      const feeds = await prisma.externalFeed.findMany({
        where: {
          userId: req.user.id,
          isActive: true
        },
        orderBy: [
          { lastFetchedAt: "desc" },
          { createdAt: "desc" }
        ],
        take: 6
      });

      const cards = [];

      for (const feed of feeds) {
        const latestItems = Array.isArray(feed.metadata?.latest_items) ? feed.metadata.latest_items : [];

        if (latestItems.length > 0) {
          cards.push(...buildExternalVisionCards(feed, latestItems));
          continue;
        }

        cards.push({
          id: feed.id,
          type: feed.feedType === "rss" ? "subscription" : "expansion",
          title: feed.name,
          summary: feed.description || "已接入外部信息源，等待首次拉取内容。",
          source: feed.name,
          url: feed.url || "",
          relevance: "可在“外部信息接入”中手动拉取最新内容"
        });
      }

      return res.json({
        cards: cards.slice(0, 12)
      });
    }

    if (["executeAutomation", "createStripeCheckout", "queryWechatOrder"].includes(name)) {
=======
    if (["executeAutomation", "savePushSubscription", "getVapidPublicKey", "createStripeCheckout", "queryWechatOrder"].includes(name)) {
>>>>>>> a4f998e (feat: 呈现产品页面)
=======
    if (name === "createWechatOrder") {
      const pack = getCreditPack(payload.packId);
      if (!pack) {
        return res.status(400).json({ error: "INVALID_PACK", message: "无效的点数包" });
      }

      const cfg = await getWechatMerchantConfig();
      if (!cfg) {
        return res.status(501).json({ error: "WECHAT_NOT_CONFIGURED", message: "微信支付未配置" });
      }

      const reuseAfterMs = 10 * 60 * 1000;
      const reuseSince = new Date(Date.now() - reuseAfterMs);
      const existing = await prisma.wechatOrder.findFirst({
        where: {
          userId: req.user.id,
          packId: pack.id,
          status: "PENDING",
          createdAt: { gt: reuseSince }
        },
        orderBy: { createdAt: "desc" }
      });

      if (existing?.codeUrl) {
        return res.json({
          data: {
            code_url: existing.codeUrl,
            order_no: existing.orderNo
          }
        });
      }

      const outTradeNo = generateOutTradeNo("wx");
      const description = `SoulSentry · ${pack.name} · ${pack.credits}点`;
      const attach = JSON.stringify({ user_id: req.user.id, pack_id: pack.id, credits: pack.credits });

      const result = await createWechatNativeOrder(
        {
          description,
          outTradeNo,
          totalFen: pack.priceFen,
          attach
        },
        cfg
      );

      const codeUrl = result?.code_url;
      if (!codeUrl) {
        return res.status(502).json({ error: "WECHAT_CREATE_ORDER_FAILED", message: "微信下单失败" });
      }

      await prisma.wechatOrder.create({
        data: {
          userId: req.user.id,
          orderNo: outTradeNo,
          packId: pack.id,
          credits: pack.credits,
          amountFen: pack.priceFen,
          description,
          codeUrl,
          status: "PENDING"
        }
      });

      return res.json({ data: { code_url: codeUrl, order_no: outTradeNo } });
    }

    if (name === "queryWechatOrder") {
      const orderNo = String(payload.order_no || "").trim();
      if (!orderNo) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少订单号" });
      }

      const order = await prisma.wechatOrder.findFirst({
        where: { orderNo, userId: req.user.id }
      });

      if (!order) {
        return res.status(404).json({ error: "NOT_FOUND", message: "订单不存在" });
      }

      if (order.status === "PAID") {
        return res.json({ data: { paid: true, order_no: order.orderNo } });
      }

      const cfg = await getWechatMerchantConfig();
      if (!cfg) {
        return res.json({ data: { paid: false, order_no: order.orderNo } });
      }

      try {
        const remote = await wechatQueryOrder(order.orderNo, cfg);
        const tradeState = remote?.trade_state;
        const transactionId = remote?.transaction_id || null;
        const successTime = remote?.success_time || null;

        if (tradeState === "SUCCESS") {
          await markWechatOrderPaid({
            orderNo: order.orderNo,
            transactionId,
            paidAt: successTime ? new Date(successTime) : null
          });
          return res.json({ data: { paid: true, order_no: order.orderNo } });
        }

        if (tradeState && tradeState !== order.status) {
          await prisma.wechatOrder.update({
            where: { id: order.id },
            data: { status: String(tradeState).slice(0, 40) }
          });
        }
      } catch (_error) {
        void _error;
      }

      return res.json({ data: { paid: false, order_no: order.orderNo } });
    }

    if (["executeAutomation", "savePushSubscription", "getVapidPublicKey", "createStripeCheckout"].includes(name)) {
>>>>>>> 8338621 (feat: 呈现产品页面)
      return res.status(501).json({
        error: "FUNCTION_NOT_IMPLEMENTED",
        message: `独立后端已预留 ${name}，但尚未完成迁移`,
        input: payload
      });
    }

    return res.status(404).json({
      error: "FUNCTION_NOT_FOUND",
      message: `未找到函数 ${name}`
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "FUNCTION_EXECUTION_FAILED",
      message: error.message || "函数执行失败"
    });
  }
});
