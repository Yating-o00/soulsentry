// 重复约定（每天/每周/每月）展示辅助：
// 是否重复约定、下一次提醒时间、倒计时文案、规则标签。
// 与后端 backend/src/lib/recurrence.js 的 computeNextReminderTime 逻辑保持一致。

const WEEKDAY_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function isRecurring(t) {
  const rule = t?.repeat_rule;
  return Boolean(rule && rule !== "none");
}

function normalizeCustom(custom) {
  if (!custom || typeof custom !== "object") return {};
  const out = {};
  if (["daily", "weekly", "monthly"].includes(custom.frequency)) out.frequency = custom.frequency;
  const interval = parseInt(custom.interval, 10);
  if (interval > 1) out.interval = Math.min(interval, 30);
  if (Array.isArray(custom.days_of_week)) {
    const days = [...new Set(custom.days_of_week.map((d) => parseInt(d, 10)).filter((d) => d >= 0 && d <= 6))];
    if (days.length > 0) out.days_of_week = days;
  }
  if (Array.isArray(custom.days_of_month)) {
    const days = [...new Set(custom.days_of_month.map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 31))];
    if (days.length > 0) out.days_of_month = days;
  }
  if (custom.end_date && /^\d{4}-\d{2}-\d{2}$/.test(String(custom.end_date))) {
    out.end_date = String(custom.end_date);
  }
  return out;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toYmd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 下一次提醒时间（严格晚于 from；锚点时间的时:分 与 星期/日期 沿用 baseISO）
export function computeNextOccurrence(baseISO, repeatRule, custom, from = new Date()) {
  const rt = new Date(baseISO);
  if (Number.isNaN(rt.getTime())) return null;
  const rule = repeatRule === "custom" ? (custom?.frequency || "daily") : repeatRule;
  if (!["daily", "weekly", "monthly"].includes(rule)) return null;
  const conf = normalizeCustom(custom);
  const interval = rule === "daily" ? (conf.interval || 1) : 1;
  const h = rt.getHours();
  const mi = rt.getMinutes();

  let cand = null;
  if (rule === "daily") {
    cand = new Date(from);
    cand.setHours(h, mi, 0, 0);
    while (cand.getTime() <= from.getTime()) {
      cand.setDate(cand.getDate() + interval);
    }
  } else if (rule === "weekly") {
    const days = conf.days_of_week && conf.days_of_week.length > 0 ? conf.days_of_week : [rt.getDay()];
    cand = new Date(from);
    cand.setHours(h, mi, 0, 0);
    for (let i = 0; i < 7 * interval + 1; i += 1) {
      if (cand.getTime() > from.getTime() && days.includes(cand.getDay())) break;
      cand.setDate(cand.getDate() + 1);
    }
    if (!days.includes(cand.getDay())) return null;
  } else {
    const dom = conf.days_of_month && conf.days_of_month.length > 0 ? conf.days_of_month[0] : rt.getDate();
    cand = new Date(from.getFullYear(), from.getMonth(), 1, h, mi, 0, 0);
    for (let i = 0; i < 24 * interval; i += 1) {
      const clamped = Math.min(dom, daysInMonth(cand.getFullYear(), cand.getMonth()));
      cand.setDate(clamped);
      if (cand.getTime() > from.getTime()) break;
      cand = new Date(cand.getFullYear(), cand.getMonth() + interval, 1, h, mi, 0, 0);
    }
  }

  if (!cand || Number.isNaN(cand.getTime())) return null;
  if (conf.end_date && toYmd(cand) > conf.end_date) return null;
  return cand;
}

// 约定的下一次提醒时间；非重复约定返回 null
export function nextOccurrenceOf(t, from = new Date()) {
  if (!isRecurring(t)) return null;
  const base = t?.reminder_time || t?.end_time || t?.due_at;
  if (!base) return null;
  return computeNextOccurrence(base, t.repeat_rule, t.custom_recurrence, from);
}

// 倒计时文案：X分钟后 / X小时后 / X天后 / 即将提醒
export function countdownText(iso, from = new Date()) {
  const ms = new Date(iso).getTime() - from.getTime();
  if (Number.isNaN(ms) || ms <= 0) return "即将提醒";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "即将提醒";
  if (min < 60) return `${min}分钟后`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}小时后`;
  return `${Math.floor(hours / 24)}天后`;
}

// 人类可读规则标签：每天 / 每周三、五 / 每月15号 / 每隔3天
export function recurrenceLabel(repeatRule, custom) {
  if (!repeatRule || repeatRule === "none") return null;
  const conf = normalizeCustom(custom);
  const rule = repeatRule === "custom" ? (conf.frequency || "daily") : repeatRule;
  if (rule === "daily") {
    return conf.interval > 1 ? `每隔${conf.interval}天` : "每天";
  }
  if (rule === "weekly") {
    if (conf.days_of_week && conf.days_of_week.length > 0) {
      const sorted = [...conf.days_of_week].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
      return `每周${sorted.map((d) => WEEKDAY_LABEL[d]).join("、").replace(/周/g, "")}`;
    }
    return "每周";
  }
  if (rule === "monthly") {
    if (conf.days_of_month && conf.days_of_month.length > 0) return `每月${conf.days_of_month[0]}号`;
    return "每月";
  }
  return null;
}

// 重复约定的徽标文案：「每天 · 3天后」；无下一期时只显示规则
export function recurringBadgeText(t, from = new Date()) {
  const label = recurrenceLabel(t?.repeat_rule, t?.custom_recurrence);
  if (!label) return null;
  const next = nextOccurrenceOf(t, from);
  return next ? `${label} · ${countdownText(next, from)}` : label;
}
