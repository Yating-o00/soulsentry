import { invokeKimiText } from "../lib/kimi.js";

// 智能约定规划：把「一类要做的事」（如"两周的健身计划"）落成母约定 + 逐日子约定。
// 架构：AI 只生成 2-5 个「日型模板」（工作日/周末/饮食等），服务端本地展开为逐日计划——
// AI 输出量降为 1/10（约 8s），参数调整（时段/天数/时长）可本地秒级重排，多轮对话体验友好。
// 仍兼容模型直接返回逐日 children 的旧形态；Kimi 失败走本地兜底模板，对话链路不中断。

const CATEGORIES = ["work", "personal", "health", "study", "family", "shopping", "finance", "checkin", "other"];
const PRIORITIES = ["high", "medium", "low"];

const DAY_MS = 86400000;
const MIN_SLOT_MS = 30 * 60000; // 今天第一条至少排在 now+30min，给创建/提醒链路留余量

// 北京时区日期/时刻（用户语境全部按 +08:00）
function chinaToday(offsetDays = 0) {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function chinaNowTime() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function roundUp5(ms) {
  return Math.ceil(ms / 300000) * 300000;
}

function hm(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(11, 16);
}

// 模型偶尔不照 schema 返回：解包常见包装形态，尽量抢救出内容
function unwrapPlan(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.parent && (Array.isArray(raw.children) || Array.isArray(raw.patterns))) return raw;
  for (const key of ["plan", "result", "data", "schedule", "方案"]) {
    const inner = raw[key];
    if (inner && typeof inner === "object" && (inner.parent || Array.isArray(inner.children) || Array.isArray(inner.patterns))) return inner;
  }
  if (Array.isArray(raw)) return { parent: {}, children: raw };
  const vals = Object.values(raw);
  if (vals.length > 0 && vals.every((v) => Array.isArray(v))) {
    return { parent: {}, children: vals.flat() };
  }
  return raw;
}

function normalizeParent(parentRaw, ctx) {
  return {
    title: String(parentRaw.title || parentRaw.name || ctx.goal || "智能规划").trim().slice(0, 60) || "智能规划",
    description: String(parentRaw.description || `「${ctx.goal}」的智能约定规划：共 ${ctx.horizonDays} 天，每天约 ${ctx.dailyMinutes} 分钟。`).slice(0, 300),
    category: CATEGORIES.includes(parentRaw.category) ? parentRaw.category : "personal",
    priority: PRIORITIES.includes(parentRaw.priority) ? parentRaw.priority : "medium"
  };
}

function titleOf(item, descText) {
  return String(item.title || item.content || item.task || item.activity || item.summary || item.name || "").trim().slice(0, 60)
    || (descText ? descText.slice(0, 16) : "");
}

// ── 日型模板 ─────────────────────────────────────────────
// applies_to 支持：daily/每天/每日、weekday/工作日、weekend/周末、mon..sun/周一..周日（可逗号或空格分隔）
const WEEKDAY_TOKEN_MAP = {
  mon: 1, monday: 1, 周一: 1, 星期一: 1, tue: 2, tuesday: 2, 周二: 2, 星期二: 2,
  wed: 3, wednesday: 3, 周三: 3, 星期三: 3, thu: 4, thur: 4, thursday: 4, 周四: 4, 星期四: 4,
  fri: 5, friday: 5, 周五: 5, 星期五: 5, sat: 6, saturday: 6, 周六: 6, 星期六: 6,
  sun: 0, sunday: 0, 周日: 0, 星期日: 0, 周天: 0
};

function appliesToMatcher(appliesTo, { defaultDaily = true } = {}) {
  const text = String(appliesTo || "daily").toLowerCase();
  const tokens = text.split(/[,，、\s/|]+/).filter(Boolean);
  const days = new Set();
  let daily = false;
  let weekday = false;
  let weekend = false;
  for (const t of tokens) {
    if (["daily", "每天", "每日", "天天", "all", "全部", "所有", "整体"].includes(t)) daily = true;
    else if (["weekday", "工作日", "平时"].includes(t)) weekday = true;
    else if (["weekend", "周末", "休息日"].includes(t)) weekend = true;
    else if (WEEKDAY_TOKEN_MAP[t] !== undefined) days.add(WEEKDAY_TOKEN_MAP[t]);
  }
  return (dayOfWeek) => {
    if (daily) return true;
    if (days.has(dayOfWeek)) return true;
    if (weekday && dayOfWeek >= 1 && dayOfWeek <= 5) return true;
    if (weekend && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
    // 模板适用日缺省时按每天；调整目标的匹配缺省按"不匹配"（交给组名模糊兜底）
    return defaultDaily && days.size === 0 && !weekday && !weekend;
  };
}

// 目标日严格子集时的序列化 + 新增项适用日判定都依赖这个集合，导出让 flowChat 也能用
export function explicitDaySet(appliesTo) {
  const text = String(appliesTo || "").toLowerCase();
  const tokens = text.split(/[,，、\s/|]+/).filter(Boolean);
  const days = new Set();
  for (const t of tokens) {
    if (["daily", "每天", "每日", "天天", "all", "全部", "所有", "整体"].includes(t)) {
      for (let d = 0; d < 7; d += 1) days.add(d);
    } else if (["weekday", "工作日", "平时"].includes(t)) {
      for (let d = 1; d <= 5; d += 1) days.add(d);
    } else if (["weekend", "周末", "休息日"].includes(t)) {
      days.add(0); days.add(6);
    } else if (WEEKDAY_TOKEN_MAP[t] !== undefined) {
      days.add(WEEKDAY_TOKEN_MAP[t]);
    }
  }
  return days;
}

const DAY_NAME_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function serializeDaySet(days) {
  const arr = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  if (arr.length === 7) return "daily";
  if (arr.length === 5 && arr.every((d) => d >= 1 && d <= 5)) return "weekday";
  if (arr.length === 2 && arr.includes(0) && arr.includes(6)) return "weekend";
  return arr.map((d) => DAY_NAME_ZH[d]).join(",");
}

// 「每周+10分钟」「每周递增5分钟」→ 10
function parseWeeklyProgression(text) {
  const m = /每\s*周[^0-9]{0,6}\+?\s*(\d{1,3})\s*分钟/.exec(String(text || ""));
  return m ? Number(m[1]) : 0;
}

function normalizePatterns(raw, ctx) {
  const list = Array.isArray(raw) ? raw : [];
  const patterns = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const descText = String(item.description || "").trim();
    const title = titleOf(item, descText);
    const startTime = String(item.start_time || item.time || item.start || "").trim();
    if (!title || !TIME_RE.test(startTime)) continue;
    patterns.push({
      plan_group: String(item.plan_group || item.group || "").trim().replace(/\s+/g, "").slice(0, 12) || "每日安排",
      kind: item.kind === "checkin" ? "checkin" : "task",
      applies_to: String(item.applies_to || item.days || item.day_type || "daily").trim().slice(0, 40),
      start_time: startTime,
      duration_minutes: clampInt(item.duration_minutes ?? item.duration ?? item.minutes, 10, 240, 30),
      title,
      description: descText.slice(0, 300) || null,
      note: String(item.note || "").trim().slice(0, 120) || null,
      weekly_progression: String(item.weekly_progression || item.progression || "").trim().slice(0, 60)
    });
    if (patterns.length >= 6) break;
  }
  return patterns;
}

// 日型模板 → 逐日子约定。预算/今日顺延/每周进阶都在本地完成。
export function expandPatterns(patterns, ctx) {
  const { horizonDays, dailyMinutes } = ctx;
  const today = chinaToday();
  const minStartMs = Date.now() + MIN_SLOT_MS;
  const matchers = patterns.map((p) => ({ p, match: appliesToMatcher(p.applies_to), step: parseWeeklyProgression(p.weekly_progression) }));
  const children = [];

  for (let i = 0; i < horizonDays; i += 1) {
    const date = chinaToday(i);
    // 北京日期的星期：必须用纯日期计算（date T00:00+08:00 的 UTC 时刻是前一日 16:00，getUTCDay 会错位一天）
    const [yy, mm, dd] = date.split("-").map(Number);
    const dayOfWeek = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
    // 缓冲日固定按周对齐在周日：按"第 7 天"留白会随起点漂移（周五起点时周四被整天空掉）
    if (horizonDays > 6 && dayOfWeek === 0 && date !== today) continue;
    const weekIndex = Math.floor(i / 7);
    const dayItems = matchers
      .filter(({ match }) => match(dayOfWeek))
      .map(({ p, step }) => ({ p, step }))
      .sort((a, b) => a.p.start_time.localeCompare(b.p.start_time));

    let used = 0;
    let cursorMs = 0; // 同一天多条时保持先后次序与 10 分钟间隔（今天顺延后会用到）
    for (const { p, step } of dayItems) {
      if (children.filter((c) => c.date === date).length >= 3) break; // 同一天最多 3 条
      let startMs = new Date(`${date}T${p.start_time}:00+08:00`).getTime();
      if (date === today && startMs < minStartMs) startMs = roundUp5(minStartMs);
      if (startMs < cursorMs) startMs = cursorMs; // 今日顺延/偏好平移后避免条目标注重叠
      const room = dailyMinutes - used;
      if (room < 10) break;
      const duration = clampInt(p.duration_minutes + step * weekIndex, 10, Math.min(240, room), Math.min(60, room));
      const finalDuration = Math.min(duration, room);
      used += finalDuration;
      cursorMs = startMs + finalDuration * 60000 + 10 * 60000;
      children.push({
        title: p.title,
        description: p.description,
        date,
        start_time: hm(startMs),
        end_time: hm(startMs + finalDuration * 60000),
        duration_minutes: finalDuration,
        note: p.note,
        kind: p.kind,
        plan_group: p.plan_group
      });
    }
    // 覆盖兜底：模型返回的模板适用日可能漏天，非缓冲日没有任何条目时给一条轻量恢复安排，保证每天都看得见
    if (dayItems.length === 0) {
      const restMs = new Date(`${date}T20:00:00+08:00`).getTime();
      const startMs = date === today && restMs < minStartMs ? roundUp5(minStartMs) : restMs;
      children.push({
        title: "轻松恢复",
        description: "今天没有专项安排，散步或拉伸 15 分钟保持节奏即可",
        date,
        start_time: hm(startMs),
        end_time: hm(startMs + 15 * 60000),
        duration_minutes: 15,
        note: null,
        kind: "task",
        plan_group: "缓冲调整"
      });
    }
  }
  if (children.length === 0) return null;
  children.sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
  return { parent: null, children };
}

// 旧形态兼容：模型直接返回逐日 children（归一化逻辑与日型展开同口径）
function normalizePlan(raw, ctx) {
  if (!raw || typeof raw !== "object") return null;
  raw = unwrapPlan(raw);
  const parent = normalizeParent(raw.parent && typeof raw.parent === "object" ? raw.parent : {}, ctx);
  const today = chinaToday();
  const horizonEnd = chinaToday(ctx.horizonDays - 1);
  const minStartMs = Date.now() + MIN_SLOT_MS;
  const perDay = new Map();

  const children = [];
  for (const item of Array.isArray(raw.children) ? raw.children : []) {
    if (!item || typeof item !== "object") continue;
    const descText = String(item.description || "").trim();
    const title = titleOf(item, descText);
    const date = String(item.date || item.day || "").trim();
    const startTime = String(item.start_time || item.time || item.start || "").trim();
    if (!title || !DATE_RE.test(date) || date < today || date > horizonEnd) continue;
    if (!TIME_RE.test(startTime)) continue;

    let startMs = new Date(`${date}T${startTime}:00+08:00`).getTime();
    if (date === today && startMs < minStartMs) startMs = roundUp5(minStartMs);
    const duration = clampInt(item.duration_minutes ?? item.duration ?? item.minutes, 10, 240, Math.min(60, ctx.dailyMinutes));
    const dayUsed = perDay.get(date) || 0;
    const room = ctx.dailyMinutes - dayUsed;
    if (room < 10) continue;
    const finalDuration = Math.min(duration, room);
    perDay.set(date, dayUsed + finalDuration);

    const kind = item.kind === "checkin" ? "checkin" : "task";
    const planGroup = String(item.plan_group || "").trim().replace(/\s+/g, "").slice(0, 12) || "每日安排";
    children.push({
      title,
      description: descText.slice(0, 300) || null,
      date,
      start_time: hm(startMs),
      end_time: hm(startMs + finalDuration * 60000),
      duration_minutes: finalDuration,
      note: String(item.note || "").trim().slice(0, 120) || null,
      kind,
      plan_group: planGroup
    });
    if (children.length >= ctx.horizonDays * 4) break;
  }

  if (children.length === 0) return null;
  children.sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
  return { parent, children };
}

// 本地兜底：Kimi 不可用时按通用模板排期。时刻优先取用户历史活跃时段（逐日轮换），其次 19:30
function slotFromInsights(insights, i) {
  const windows = Array.isArray(insights?.activeWindows) ? insights.activeWindows : [];
  const m = windows.length ? /^(\d{1,2}):00/.exec(windows[i % windows.length]) : null;
  const hour = m ? Math.min(22, Math.max(7, Number(m[1]))) : 19;
  return `${String(hour).padStart(2, "0")}:30`;
}

export function buildFallbackPlan({ goal, horizonDays, dailyMinutes, insights = null, now = new Date() } = {}) {
  const g = String(goal || "新的计划").trim().slice(0, 40) || "新的计划";
  const days = clampInt(horizonDays, 2, 30, 7);
  const minutes = clampInt(dailyMinutes, 15, 180, 30);
  const parent = {
    title: `${g}（${days}天计划）`.slice(0, 60),
    description: `「${g}」的${days}天智能规划：每天约 ${minutes} 分钟，由兜底模板生成，可继续提偏好让我重排。`.slice(0, 300),
    category: "personal",
    priority: "medium"
  };
  const children = [];
  const minStartMs = roundUp5(now.getTime() + MIN_SLOT_MS);
  for (let i = 0; i < days; i += 1) {
    const date = chinaToday(i);
    const [fy, fm, fd] = date.split("-").map(Number);
    // 缓冲日固定对齐周日（与 expandPatterns 同口径），按"第 7 天"留白会随起点漂移
    if (days > 6 && new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay() === 0 && i !== 0) continue;
    let startMs = new Date(`${date}T${slotFromInsights(insights, i)}:00+08:00`).getTime();
    if (i === 0 && startMs < minStartMs) startMs = minStartMs;
    children.push({
      title: `${g} · 第${i + 1}天`,
      description: `第 ${i + 1} 天 / 共 ${days} 天，建议 ${minutes} 分钟`.slice(0, 300),
      date,
      start_time: hm(startMs),
      end_time: hm(startMs + minutes * 60000),
      duration_minutes: minutes,
      note: null,
      kind: "task",
      plan_group: "每日安排"
    });
  }
  return { parent, children };
}

// 偏好 → 目标时刻（多轮对话里"改成早上"这类调整的本地秒级应用）
function targetHourFromPreferences(preferences, insights) {
  const text = String(preferences || "");
  // 文案里带明确时刻（如"周六改到上午8-9点"）时直接取该时刻，不再按时段词猜默认值
  const explicit = parseClockValue(text);
  if (explicit) return Number(explicit.clock.split(":")[0]);
  const windows = Array.isArray(insights?.activeWindows) ? insights.activeWindows : [];
  const firstWindowHour = (() => { const m = /^(\d{1,2}):00/.exec(windows[0] || ""); return m ? Number(m[1]) : null; })();
  if (/早上|早晨|上午|早/.test(text)) {
    const morning = windows.find((w) => Number(/^(\d{1,2}):00/.exec(w)[1]) < 12);
    const m = morning ? /^(\d{1,2}):00/.exec(morning) : null;
    return m ? Number(m[1]) : 7;
  }
  if (/睡前|夜里|晚上|晚间|晚/.test(text)) return firstWindowHour !== null && firstWindowHour >= 18 ? firstWindowHour : 19;
  if (/下午|午后/.test(text)) return 15;
  if (/中午|午间/.test(text)) return 12;
  return null;
}

// 参数级调整（时段/天数/时长）本地重排：不调用 AI，秒级返回
export function reexpandPlan(patterns, { goal, horizonDays, dailyMinutes, preferences, insights = null, baseDailyMinutes } = {}) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const ctx = {
    goal: String(goal || "智能规划").slice(0, 60),
    horizonDays: clampInt(horizonDays, 2, 30, 7),
    dailyMinutes: clampInt(dailyMinutes, 15, 180, 30)
  };
  const targetHour = targetHourFromPreferences(preferences, insights);
  const scale = baseDailyMinutes ? ctx.dailyMinutes / clampInt(baseDailyMinutes, 15, 180, ctx.dailyMinutes) : 1;
  const adjusted = patterns.map((p) => {
    const next = { ...p };
    if (targetHour !== null) {
      const [h, m] = String(p.start_time).split(":").map(Number);
      const shifted = Math.min(22, Math.max(7, targetHour + (h % 2))); // 保留原先后移的错落感
      next.start_time = `${String(shifted).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
    }
    if (scale !== 1) {
      next.duration_minutes = clampInt(Math.round(p.duration_minutes * scale), 10, 240, p.duration_minutes);
    }
    return next;
  });
  const expanded = expandPatterns(adjusted, ctx);
  if (!expanded) return null;
  return { parent: normalizeParent({}, ctx), children: expanded.children };
}

// ── 定向调整：「周末加到一小时」「改到晚上」这类语义 → 补丁日型模板 ──
// 文本分钟数解析：一小时/60分钟/半个钟头/一个半小时/十分钟 → 分钟
export function parseMinutesText(text) {
  const t = String(text || "").replace(/\s+/g, "");
  if (!t) return null;
  let m = /(\d+)\s*分钟/.exec(t);
  if (m) return clampInt(m[1], 1, 240, null);
  m = /(六十|四十五|四十|三十|二十|十五|十)\s*分钟/.exec(t);
  if (m) {
    const CN_MIN = { 十: 10, 十五: 15, 二十: 20, 三十: 30, 四十: 40, 四十五: 45, 六十: 60 };
    return clampInt(CN_MIN[m[1]], 1, 240, null);
  }
  m = /(\d+)\s*(小时|钟头)/.exec(t);
  if (m) return clampInt(Number(m[1]) * 60, 1, 240, null);
  if (/一个半小时/.test(t)) return 90;
  if (/半小时|半个钟头/.test(t)) return 30;
  if (/一小时|一个钟头/.test(t)) return 60;
  if (/两小时|两个钟头/.test(t)) return 120;
  if (/三小时/.test(t)) return 180;
  const bare = /^(\d{1,3})$/.exec(t);
  if (bare) return clampInt(bare[1], 1, 240, null);
  return null;
}

function parseClockText(text) {
  const m = /([01]?\d|2[0-3])[:：.]([0-5]\d)/.exec(String(text || ""));
  if (m) return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
  const half = /([01]?\d|2[0-3])\s*点半/.exec(String(text || ""));
  if (half) return `${String(half[1]).padStart(2, "0")}:30`;
  const h = /([01]?\d|2[0-3])\s*点/.exec(String(text || ""));
  if (h) return `${String(h[1]).padStart(2, "0")}:00`;
  return null;
}

// 时刻值解析：「8」「8:30」「8-9点」「8:30-9:15」「早上8」；区间同时给出跨度分钟（改到 8-9 点 = 起点 8 点 + 时长 60）
function parseClockValue(text) {
  const t = String(text || "");
  const toMin = (h, m2) => Number(h) * 60 + Number(m2 || 0);
  let m = /([01]?\d|2[0-3])[:：.]([0-5]\d)\s*[-—~～到至]\s*([01]?\d|2[0-3])[:：.]([0-5]\d)/.exec(t);
  if (m) {
    const span = toMin(m[3], m[4]) - toMin(m[1], m[2]);
    return { clock: `${String(m[1]).padStart(2, "0")}:${m[2]}`, spanMinutes: span > 0 ? span : null };
  }
  m = /([01]?\d|2[0-3])\s*[-—~～到至]\s*([01]?\d|2[0-3])\s*点(半)?/.exec(t);
  if (m) {
    const span = toMin(m[2], m[3] ? 30 : 0) - toMin(m[1], 0);
    return { clock: `${String(m[1]).padStart(2, "0")}:00`, spanMinutes: span > 0 ? span : null };
  }
  const clock = parseClockText(t);
  return clock ? { clock, spanMinutes: null } : null;
}

// 「下午3点」「19:30」「8-9点」「睡前」→ { clock: "HH:MM", spanMinutes }；12小时制+时段词自动转 24 小时制
function normalizeClockPhrase(raw) {
  const value = String(raw || "").trim();
  if (!value) return { clock: null, spanMinutes: null };
  let parsed = parseClockValue(value);
  if (!parsed) {
    const fake = targetHourFromPreferences(value, null);
    if (fake !== null) parsed = { clock: `${String(fake).padStart(2, "0")}:00`, spanMinutes: null };
  }
  if (!parsed) return { clock: null, spanMinutes: null };
  let [hh, mm] = parsed.clock.split(":").map(Number);
  // 12 小时制 + 时段词 → 24 小时制（晚上7点→19:00，中午1点→13:00? 按口语中午=12点档）
  if (/晚上|晚间|夜里|夜/.test(value) && hh < 12) hh += 12;
  else if (/下午|午后/.test(value) && hh < 12) hh += 12;
  else if (/中午|午间/.test(value) && hh <= 11) hh = 12;
  return {
    clock: `${String(Math.min(23, hh)).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    spanMinutes: parsed.spanMinutes
  };
}

// target（周末/工作日/每天/周六/组名…）能命中哪些模板：按"适用日重叠"判定
function matchTargetIndexes(patterns, target) {
  const targetMatcher = appliesToMatcher(target, { defaultDaily: false });
  const matched = [];
  for (let i = 0; i < patterns.length; i += 1) {
    const pm = appliesToMatcher(patterns[i].applies_to);
    let overlap = false;
    for (let d = 0; d < 7; d += 1) {
      if (targetMatcher(d) && pm(d)) { overlap = true; break; }
    }
    if (overlap) matched.push(i);
  }
  // 组名/标题模糊兜底（字符重合度），命中冲突时取最高分的一个，避免「跑步」同时改掉慢跑和长跑
  if (matched.length === 0) {
    const t = String(target || "").replace(/[的\s]/g, "");
    if (t) {
      let best = -1;
      let bestScore = 0.49;
      let bestExact = false;
      for (let i = 0; i < patterns.length; i += 1) {
        const hay = `${patterns[i].plan_group}${patterns[i].title}`;
        const exact = hay.includes(t) || (patterns[i].title && t.includes(patterns[i].title));
        const chars = [...new Set(t)];
        const score = chars.length > 0 ? chars.filter((c) => hay.includes(c)).length / chars.length : 0;
        if ((exact && !bestExact) || (exact === bestExact && score > bestScore)) {
          best = i;
          bestScore = score;
          bestExact = exact;
        }
      }
      if (best >= 0) matched.push(best);
    }
  }
  return matched;
}

// 应用结构化调整，返回补丁后的模板 + 人类可读的应用清单 + 未命中的调整
export function applyPlanAdjustments(patterns, adjustments = []) {
  const next = patterns.map((p) => ({ ...p }));
  const applied = [];
  const missed = [];
  for (const adj of Array.isArray(adjustments) ? adjustments : []) {
    if (!adj || typeof adj !== "object") continue;
    const target = String(adj.target || "全部");
    const field = String(adj.field || "duration");
    const value = String(adj.value ?? "");
    // 「周六下午3点加半小时瑜伽」→ 在规划里新增一项（不需要匹配既有模板）
    if (field === "add") {
      const title = value.replace(/[吧呢哦哈呀啊]+$/, "").trim().slice(0, 16);
      if (!title) { missed.push(adj); continue; }
      const tDays = explicitDaySet(target);
      const applies = tDays.size > 0 ? serializeDaySet(tDays) : "daily";
      const normClock = normalizeClockPhrase(adj.start_time ?? "");
      const start = normClock.clock || "19:30";
      const span = normClock.spanMinutes;
      const rawDur = Number(adj.duration_minutes);
      const dur = Number.isFinite(rawDur) && rawDur > 0
        ? clampInt(rawDur, 10, 240, 30)
        : clampInt(parseMinutesText(String(adj.duration_minutes || "")) || span || 30, 10, 240, 30);
      // 已有同名/相互包含且适用日重叠的模板 → 更新它，避免同一项被加两遍
      const existingIdx = next.findIndex((p2) => {
        const sameName = p2.title === title
          || (p2.title && (p2.title.includes(title) || title.includes(p2.title)));
        if (!sameName) return false;
        if (tDays.size === 0) return true;
        const pDays = explicitDaySet(p2.applies_to);
        return [...tDays].some((d) => pDays.has(d));
      });
      if (existingIdx >= 0) {
        next[existingIdx] = { ...next[existingIdx], start_time: start, duration_minutes: dur };
        applied.push(`${next[existingIdx].title} 已更新为 ${start}·${dur}分钟`);
      } else {
        next.push({
          plan_group: title.slice(0, 8) || "加练安排",
          kind: "checkin",
          applies_to: applies,
          start_time: start,
          duration_minutes: dur,
          title,
          description: null,
          note: null,
          weekly_progression: ""
        });
        applied.push(`新增 ${title}（${applies} ${start}·${dur}分钟）`);
      }
      continue;
    }
    const idxs = matchTargetIndexes(next, target);
    if (idxs.length === 0) { missed.push(adj); continue; }
    // 目标日是模板适用日的严格子集（「周六」命中 weekend/daily 模板）→ 拆出子模板只改目标日，其余日保持原样
    const targetDays = explicitDaySet(target);
    const effective = [];
    for (const i of idxs) {
      const p = next[i];
      const pDays = explicitDaySet(p.applies_to);
      if (targetDays.size > 0 && targetDays.size < pDays.size && [...targetDays].every((d) => pDays.has(d))) {
        const rest = new Set([...pDays].filter((d) => !targetDays.has(d)));
        const clone = { ...p, applies_to: serializeDaySet(targetDays) };
        next[i] = { ...p, applies_to: serializeDaySet(rest) };
        next.push(clone);
        effective.push({ p: clone, scope: serializeDaySet(targetDays) });
      } else {
        effective.push({ p, scope: null });
      }
    }
    for (const { p, scope } of effective) {
      const scopeTag = scope ? `[${scope}] ` : "";
      if (field === "duration") {
        const isIncrement = value.trim().startsWith("+");
        const mins = parseMinutesText(value);
        if (!mins) { missed.push(adj); continue; }
        const old = p.duration_minutes;
        p.duration_minutes = isIncrement
          ? clampInt(old + mins, 10, 240, old)
          : clampInt(mins, 10, 240, old);
        applied.push(`${scopeTag}${p.title} ${old}→${p.duration_minutes}分钟`);
        // 描述里的旧时长同步替换（如「15分钟自重训练」→「60分钟自重训练」），避免内容与新时长矛盾
        if (p.description) {
          if (/\d+\s*分钟/.test(p.description)) {
            p.description = p.description.replace(/\d+\s*分钟/, `${p.duration_minutes}分钟`).slice(0, 300);
          } else if (Math.abs(p.duration_minutes - old) / Math.max(old, 1) > 0.2 && !p.description.includes("时长已调整")) {
            p.description = `${p.description}（时长已调整为 ${p.duration_minutes} 分钟）`.slice(0, 300);
          }
        }
      } else if (field === "start_time") {
        const normClock = normalizeClockPhrase(value);
        if (!normClock.clock) { missed.push(adj); continue; }
        p.start_time = normClock.clock;
        // 「改到 8-9 点」这类区间：跨度即时长
        if (normClock.spanMinutes) {
          p.duration_minutes = clampInt(normClock.spanMinutes, 10, 240, p.duration_minutes);
        }
        applied.push(`${scopeTag}${p.title} 时刻→${normClock.clock}${normClock.spanMinutes ? ` 时长→${p.duration_minutes}分钟` : ""}`);
      } else if (field === "content") {
        if (!value.trim()) { missed.push(adj); continue; }
        p.description = value.trim().slice(0, 300);
        applied.push(`${scopeTag}${p.title} 内容已更新`);
      } else if (field === "note") {
        p.note = value.trim().slice(0, 120) || null;
        applied.push(`${scopeTag}${p.title} 提示已更新`);
      } else {
        missed.push(adj);
      }
    }
  }
  return { patterns: next, applied, missed };
}

// 展开所需的最小每日预算（防止显式调大的时长被原预算压回）
export function requiredBudget(patterns) {
  let max = 0;
  for (let d = 0; d < 7; d += 1) {
    let sum = 0;
    for (const p of patterns) {
      if (appliesToMatcher(p.applies_to)(d)) sum += p.duration_minutes;
    }
    max = Math.max(max, sum);
  }
  return max;
}

// 本地兜底语义提取：模型没抽出 adjustments 时，用正则抓「对象+时长/时刻」
export function extractAdjustmentsFromText(text) {
  const t = String(text || "");
  if (!t) return null;
  const out = [];
  const dur = /(?:(周末|周六和周日|周[一二三四五六日天]|工作日|周一到周五|每天|日常|全部|所有)|([一-龥]{2,8}?))[^。！？\n]{0,10}?(加到|增加|加强|加长|延长|调到|减到|缩到|提到|升到|改成)[^。！？\n]{0,6}?(\d+|一|两|半|一个半)[\s]*(?:个)?(?:半)?(小时|钟头|分钟)/.exec(t);
  if (dur) {
    let target = dur[1] || "";
    if (!target) {
      // 未知对象：清掉口语前缀后仍无意义（单字/时长时间类）→ 按全局处理
      const raw = String(dur[2] || "").replace(/^把/, "");
      target = raw.length >= 2 && !/时[长间]$|整体/.test(raw) ? raw : "全部";
    }
    if (/时长|时间|每天|整体|所有/.test(target)) target = "全部";
    const mins = parseMinutesText(dur[0].slice((dur[1] || dur[2] || "").length));
    if (mins) {
      // 「增加/延长一小时」是在原时长上追加；「加到/加强一小时」是设为该时长
      const additive = /增加|延长|多加|再多|再加/.test(dur[3] || "");
      out.push({ target, field: "duration", value: additive ? `+${mins}分钟` : `${mins}分钟` });
    }
  }
  const clock = /(周末|周六和周日|周[一二三四五六日天]|工作日|周一到周五|每天|日常|全部|所有)?[^。！？\n]{0,10}?(改到|调到|放到|挪到)\s*((?:(?:早上|上午|中午|下午|晚上|晚间|睡前)\s*)?[0-9]{1,2}\s*(?:[-—~～到至]\s*[0-9]{1,2}\s*)?(?:[:：点]\s*(?:[0-5]\d|半)|[:：点])?|早上|上午|中午|下午|晚上|晚间|睡前)/.exec(t);
  if (clock) {
    out.push({ target: clock[1] || "全部", field: "start_time", value: clock[3] });
  }
  // 「把跑步换成游泳」「把自重训练改成瑜伽」→ 内容替换（值若是时长数字则不按内容处理）
  const swap = /把(.{1,12}?)(?:换成|改成|替换成|变为)(.{1,24})/.exec(t);
  if (swap && !/(\d+|一|两|半)[\s]*(?:个)?(?:半)?(?:小时|钟头|分钟)/.test(swap[2])) {
    out.push({ target: swap[1].trim(), field: "content", value: swap[2].trim() });
  }
  // 「周六下午3点加半小时瑜伽」「每天睡前加15分钟冥想」→ 在规划里新增一项。
  // 只在时长/时刻提取都没命中时尝试（防"周末加到一小时"被误判）；内容替换与新增可同句并存
  if (!dur && !clock) {
    const add = /(周末|周六和周日|周[一二三四五六日天]|工作日|周一到周五|每天|每日|日常|全部|所有)?\s*(?:的)?\s*((?:(?:早上|早晨|上午|中午|午间|下午|午后|晚上|晚间|夜里|睡前|凌晨)\s*)?(?:[0-9]{1,2}\s*(?:[:：]\s*[0-5]\d|[:：点]\s*(?:[0-5]\d|半)|点|[:：]))?)?\s*(?:加上?|再加|增加|来)\s*(?:(\d+|一|两|半|一个半)\s*(?:个)?(?:半)?(小时|钟头|分钟))?\s*([一-龥a-zA-Z][一-龥a-zA-Z0-9·]{1,11})$/.exec(t.trim());
    if (add) {
      const target = add[1] || "每天";
      const timePhrase = (add[2] || "").trim();
      const durMins = add[3] && add[4] ? parseMinutesText(`${add[3]}${add[4]}`) : null;
      let title = (add[5] || "").trim()
        .replace(/^(的|点|个|一[个次组套]?)(?=[一-龥a-zA-Z])/, "")
        .replace(/[吧呢哦哈呀啊]+$/, "")
        .trim()
        .slice(0, 16);
      const hasSignal = Boolean(add[1] || timePhrase || durMins);
      const badTitle = !title
        || /^(小时|分钟|钟头|一|两|半|个|到|至|成|为|给|把|让)$/.test(title)
        || /[加改调到换成把让]$/.test(title)
        || /[到至成为]/.test(title)
        || /^(我|你|他|她|它|这|那|它)/.test(title);
      if (hasSignal && !badTitle) {
        const normClock = normalizeClockPhrase(timePhrase);
        out.push({
          target,
          field: "add",
          value: title,
          start_time: normClock.clock || undefined,
          duration_minutes: durMins || normClock.spanMinutes || undefined
        });
      }
    }
  }
  return out.length > 0 ? out : null;
}

// 多轮调整时模型调整与本地提取的取舍：新增项以本地对原话的解析为准（模型常丢适用日→铺成"每天"出 12 条）；
// 模型给的新增项若适用日与原话里的星期词对不上，直接丢弃，不静默铺开。
export function resolvePlanAdjustments({ modelAdjustments = null, textAdjustments = null, lastUserText = "" } = {}) {
  const modelList = Array.isArray(modelAdjustments) && modelAdjustments.length ? modelAdjustments : null;
  const textList = Array.isArray(textAdjustments) && textAdjustments.length ? textAdjustments : null;
  const textAdd = textList && textList.some((a) => a && a.field === "add");
  let adjustments = textAdd ? textList : (modelList || textList);
  let via = textAdd ? "text" : (modelList ? "model" : (textList ? "text" : null));
  if (adjustments && !textAdd) {
    // 原话里出现的所有星期词（用于校验模型新增项的适用日）
    const utterDays = new Set();
    const dayTokens = String(lastUserText || "").match(/周末|周六和周日|周[一二三四五六日天]|工作日|周一到周五|每天|每日|天天|日常/g) || [];
    for (const tok of dayTokens) {
      for (const d of explicitDaySet(tok)) utterDays.add(d);
    }
    const filtered = adjustments.filter((a) => {
      if (!a || a.field !== "add") return true;
      const tDays = explicitDaySet(a.target);
      if (tDays.size === 0) return false; // 适用日完全缺失 → 不猜，交回追问
      if (utterDays.size === 0) return tDays.size < 7; // 原话没有星期词：只接受具体日（每天=模型脑补）
      // 原话有星期词：模型适用日必须与原话吻合——收窄可以，变宽不行（周六→每天/周末会静默铺开）
      if (tDays.size < utterDays.size) return true;
      if ([...utterDays].some((d) => !tDays.has(d))) return false;
      if (utterDays.size < 7 && tDays.size > utterDays.size) return false;
      return true;
    });
    if (filtered.length !== adjustments.length) {
      adjustments = filtered.length ? filtered : null;
      if (!adjustments) via = null;
    }
  }
  return { adjustments, via };
}

export async function planCommitmentWithKimi({ goal, horizonDays, dailyMinutes, preferences, existing = [], insights = null, now = new Date() } = {}) {
  const ctx = {
    goal: String(goal || "").trim().slice(0, 80),
    horizonDays: clampInt(horizonDays, 2, 30, 7),
    dailyMinutes: clampInt(dailyMinutes, 15, 180, 30)
  };
  if (!ctx.goal) {
    return { ...buildFallbackPlan({ goal: "新的计划", ...ctx, insights, now }), source: "fallback" };
  }

  const today = chinaToday();
  const schema = {
    type: "object",
    properties: {
      parent: {
        type: "object",
        properties: {
          title: { type: "string", description: "母约定标题，≤20字，不含天数" },
          description: { type: "string", description: "一句话说明目标与节奏，≤40字" },
          category: { type: "string", enum: CATEGORIES },
          priority: { type: "string", enum: PRIORITIES }
        },
        required: ["title", "description"]
      },
      patterns: {
        type: "array",
        description: "日型模板 2-5 条：把计划按内容归类（如工作日训练/周末强化/饮食配合），同类项共用一个模板，不要逐日展开",
        items: {
          type: "object",
          properties: {
            plan_group: { type: "string", description: "分组名，≤8字，如「日常训练」「周末强化」「饮食配合」" },
            kind: { type: "string", enum: ["checkin", "task"], description: "checkin=每日坚持做完要打卡的项；task=普通定时项（默认）" },
            applies_to: { type: "string", description: "适用日：daily / weekday / weekend / mon..sun / 周一..周日，可逗号组合" },
            start_time: { type: "string", description: "HH:MM，24小时制，避开 23:00-7:00，贴合用户活跃时段" },
            duration_minutes: { type: "number", description: "单次时长，10-240" },
            title: { type: "string", description: "≤16字，内容要点，如「慢跑+拉伸」" },
            description: { type: "string", description: "可执行动作+量化标准，≤30字，如「慢跑3公里，前后拉伸各5分钟」" },
            note: { type: "string", description: "可选，执行小提示，≤20字" },
            weekly_progression: { type: "string", description: "可选，每周进阶，如「每周+5分钟」或「第2周加速」" }
          },
          required: ["plan_group", "applies_to", "start_time", "duration_minutes", "title"]
        }
      }
    },
    required: ["parent", "patterns"]
  };

  const busyBlocks = Array.isArray(existing) ? existing.slice(0, 40) : [];
  // 个性化信号压成一行一条的短句：prompt 越长模型推理越深，实测短 prompt 5s 可出完整模板
  const bits = [];
  if (Array.isArray(insights?.activeWindows) && insights.activeWindows.length > 0) {
    bits.push(`活跃时段参考：${insights.activeWindows.join("、")}`);
  }
  if (insights?.subtaskDoneRate30d !== null && insights?.subtaskDoneRate30d !== undefined) {
    bits.push(`近30天完成率 ${Math.round(insights.subtaskDoneRate30d * 100)}%${insights.subtaskDoneRate30d < 0.5 ? "（偏低，首周请减量起步）" : ""}`);
  }
  if (Array.isArray(insights?.existingCheckins) && insights.existingCheckins.length > 0) {
    bits.push(`已有打卡约定：${insights.existingCheckins.map((c) => (c.hour !== null && c.hour !== undefined ? `${c.title}(${c.hour}点)` : c.title)).join("、")}（内容重合请避开其时刻）`);
  }
  if (busyBlocks.length > 0) {
    bits.push(`已有安排（避开这些时段）：${JSON.stringify(busyBlocks).slice(0, 300)}`);
  }
  const prompt = `用户想规划：「${ctx.goal}」，共 ${ctx.horizonDays} 天（自 ${today} 起），每天累计约 ${ctx.dailyMinutes} 分钟。偏好：${String(preferences || "无").slice(0, 100)}
${bits.join("\n")}
不要逐日展开，只输出「日型模板」patterns（2-5 条，如工作日训练/周末强化/饮食配合），每条含：plan_group（组名≤8字）、kind（每日坚持做完要打卡的项填 checkin，其余 task）、applies_to（weekday/weekend/daily/周一..周日，可逗号组合；所有模板的适用日合起来必须覆盖规划期每一天，不要漏天）、start_time（HH:MM，避开 23:00-7:00，今天的时刻须晚于 ${chinaNowTime()}）、duration_minutes、title（≤16字）、description（≤30字，含量化标准如「慢跑3公里」）、note（可选≤20字）、weekly_progression（可选，写「每周+N分钟」形式）。每满 7 天留 1 天缓冲不用排。直接输出 JSON。`;

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { data, usage } = await Promise.race([
        invokeKimiText({
          prompt,
          systemPrompt: "你是约定规划师。把长期目标拆成母约定 + 2-5 个日型模板。只输出 JSON，不要长篇思考。",
          responseJsonSchema: schema,
          model: "kimi-k2.7-code-highspeed",
          maxTokens: 8000,
          fetchTimeout: 60000,
          withUsage: true
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("PLAN_TIMEOUT")), 60000))
      ]);

      // 主路径：日型模板 → 本地展开
      if (data && typeof data === "object") {
        const unwrapped = unwrapPlan(data);
        const rawPatterns = Array.isArray(data.patterns) ? data.patterns
          : Array.isArray(unwrapped?.patterns) ? unwrapped.patterns : null;
        if (rawPatterns) {
          const parent = normalizeParent(unwrapped.parent && typeof unwrapped.parent === "object" ? unwrapped.parent : {}, ctx);
          const patterns = normalizePatterns(rawPatterns, ctx);
          const expanded = expandPatterns(patterns, ctx);
          if (expanded) return { parent, children: expanded.children, patterns, usage };
        }
        // 兼容路径：模型直接给了逐日 children
        const legacy = normalizePlan(data, ctx);
        if (legacy) return { ...legacy, patterns: null, usage };
      }
      lastErr = new Error("模型返回缺少可用模板");
    } catch (err) {
      lastErr = err;
      console.warn(`[planCommitment] 第 ${attempt} 次规划失败:`, err?.message || err);
    }
  }
  console.warn("[planCommitment] 规划失败，使用兜底模板:", lastErr?.message || lastErr);
  return { ...buildFallbackPlan({ ...ctx, insights, now }), source: "fallback", patterns: null };
}
