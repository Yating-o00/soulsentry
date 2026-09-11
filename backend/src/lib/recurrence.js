// 重复约定（每日 / 每周 / 每月）规则解析与下一提醒周期计算
// 规则字段落库在 task.metadata._extraFields：repeat_rule + custom_recurrence

const WEEKDAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const WEEKDAY_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
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

/**
 * 从自由文本识别重复语义，如：
 *   每天 / 每日 / 每晚 / 天天 → daily
 *   每隔 3 天 → custom(daily, interval 3)
 *   每周 / 每周三五 / 每星期三和五 / 工作日 / 周末 → weekly(+days_of_week)
 *   每月 / 每月 15 号 → monthly(+days_of_month)
 * 返回 { repeat_rule, custom_recurrence } 或 null
 */
export function parseRecurrenceFromText(text) {
  const t = String(text || "").replace(/\s+/g, "");
  if (!t) return null;

  // 工作日 / 周末（无"每"前缀也算重复习惯）
  if (/工作日/.test(t)) {
    return { repeat_rule: "weekly", custom_recurrence: { frequency: "weekly", days_of_week: [1, 2, 3, 4, 5] } };
  }
  if (/每?周末/.test(t) && !/[下上这]周末/.test(t)) {
    return { repeat_rule: "weekly", custom_recurrence: { frequency: "weekly", days_of_week: [0, 6] } };
  }

  // 每隔 N 天
  const intervalMatch = t.match(/每(?:隔|过)?(\d+)天/);
  if (intervalMatch) {
    const n = parseInt(intervalMatch[1], 10);
    if (n > 1) return { repeat_rule: "custom", custom_recurrence: { frequency: "daily", interval: n } };
    return { repeat_rule: "daily", custom_recurrence: { frequency: "daily" } };
  }

  // 每月（可带几号）
  const monthlyMatch = t.match(/每(?:个|一)?月(?:的)?(?:(\d{1,2})[日号])?/);
  if (monthlyMatch) {
    const custom = { frequency: "monthly" };
    if (monthlyMatch[1]) {
      const dom = parseInt(monthlyMatch[1], 10);
      if (dom >= 1 && dom <= 31) custom.days_of_month = [dom];
    }
    return { repeat_rule: "monthly", custom_recurrence: custom };
  }

  // 每周（可带多个星期几）：每周三、每周三五、每星期三和五、每周三/五
  const weeklyMatch = t.match(/每(?:个|一)?(?:周|星期|礼拜)/);
  if (weeklyMatch) {
    const custom = { frequency: "weekly" };
    const rest = t.slice(weeklyMatch.index);
    const days = [];
    const dayRe = /[周星期礼拜]([一二三四五六日天])/g;
    let m;
    while ((m = dayRe.exec(rest)) !== null) {
      days.push(WEEKDAY_MAP[m[1]]);
      // "和/、"连接的后续星期几也在 rest 里，继续匹配即可
    }
    const uniq = [...new Set(days)].filter((d) => d !== undefined);
    if (uniq.length > 0) custom.days_of_week = uniq;
    return { repeat_rule: "weekly", custom_recurrence: custom };
  }

  // 每天 / 每日 / 每晚 / 天天
  if (/每天|每日|每晚|每夜|天天|每早|每晚间/.test(t)) {
    return { repeat_rule: "daily", custom_recurrence: { frequency: "daily" } };
  }

  return null;
}

function parseMinute(raw) {
  if (!raw) return 0;
  if (/半/.test(raw)) return 30;
  if (/一刻/.test(raw)) return 15;
  if (/三刻/.test(raw)) return 45;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * 从重复类输入里提取当日时刻（取时间段起点）：
 *   晚6-7点 → 18:00   晚上8点半 → 20:30   早7点 → 7:00   下午3:15 → 15:15
 * 返回 { hour, minute } 或 null
 */
export function parseTimeOfDay(text) {
  const t = String(text || "").replace(/\s+/g, "");
  if (!t) return null;

  const periodRe = "(凌晨|早上|早晨|清晨|上午|中午|下午|晚上|晚间|晚|早|今晚|今夜)";
  const minuteRe = "(\\d{1,2}|半|一刻|三刻)";

  // 时间段：晚6-7点 / 晚上8点-9点 / 6:30-7:30，取起点
  const rangeRe = new RegExp(`${periodRe}?(\\d{1,2})[点:：]?${minuteRe}?(?:到|-|—|至)(?:\\d{1,2})[点]`);
  const range = t.match(rangeRe);
  if (range) {
    return { hour: adjustHour(parseInt(range[2], 10), range[1], t), minute: parseMinute(range[3]) };
  }

  // 单个时刻：晚8点 / 晚上8点半 / 早7:30
  const singleRe = new RegExp(`${periodRe}(\\d{1,2})[点:：]${minuteRe}?`);
  const single = t.match(singleRe);
  if (single) {
    return { hour: adjustHour(parseInt(single[2], 10), single[1], t), minute: parseMinute(single[3]) };
  }

  return null;
}

function adjustHour(hour, period, fullText) {
  let h = hour;
  if (/下午|晚上|晚间|晚|今晚|今夜/.test(period || "") && h < 12) h += 12;
  if (/中午/.test(period || "") && h < 11) h += 12;
  if (/凌晨/.test(period || "") && h === 12) h = 0;
  // "6-7点"这种裸时间段默认按晚间处理（重复事项多在晚上）
  if (!period && /[到至—-]\d{1,2}点/.test(fullText) && h < 12) h += 12;
  return h;
}

/**
 * 计算下一次提醒时间（严格晚于 from，通常 from = 本次发送时刻）
 * reminderTime 提供时刻（时:分）与默认星期/日期锚点
 * 超过 custom_recurrence.end_date 时返回 null（停止重复）
 */
export function computeNextReminderTime(reminderTime, repeatRule, custom, from = new Date()) {
  const rt = reminderTime instanceof Date ? reminderTime : new Date(reminderTime);
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

/**
 * 对齐首次提醒到重复周期内的正确日期：
 * 每周三 + 解析出"明天晚上8点" → 推到下一个周三 20:00；每月15号同理
 * 返回 { date: YYYY-MM-DD, time: HH:mm }（本地时区）
 */
export function alignFirstOccurrence(dateYmd, timeHm, repeatRule, custom, from = new Date()) {
  const conf = normalizeCustom(custom);
  const rule = repeatRule === "custom" ? (conf.frequency || "daily") : repeatRule;
  let d = new Date(`${dateYmd}T${timeHm}:00`);
  if (Number.isNaN(d.getTime())) return { date: dateYmd, time: timeHm };

  if (rule === "weekly" && conf.days_of_week && conf.days_of_week.length > 0) {
    for (let i = 0; i < 8; i += 1) {
      if (conf.days_of_week.includes(d.getDay()) && d > from) break;
      d.setDate(d.getDate() + 1);
    }
  } else if (rule === "monthly" && conf.days_of_month && conf.days_of_month.length > 0) {
    const dom = conf.days_of_month[0];
    for (let i = 0; i < 14; i += 1) {
      d.setDate(Math.min(dom, daysInMonth(d.getFullYear(), d.getMonth())));
      if (d > from) break;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes(), 0, 0);
    }
  } else {
    return { date: dateYmd, time: timeHm };
  }
  return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// 人类可读标签：每天 / 每周三、五 / 每月15号 / 每隔3天
export function recurrenceLabel(repeatRule, custom) {
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
