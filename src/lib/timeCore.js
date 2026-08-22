/**
 * ============================================================
 * 时间核心工具 (Time Core) - 统一时间处理规范
 * ============================================================
 *
 * 目标：解决系统中"时间模糊"问题，为所有模块（Welcome/Dashboard/
 * Tasks/日周月规划）提供统一的时间规范化能力。
 *
 * 所有时间字段最终都会经过此模块处理，确保：
 *   1. 时区统一为 Asia/Shanghai
 *   2. 输出 ISO 8601 格式（带时区）
 *   3. 缺失时间时的默认值行为一致
 *   4. is_all_day / end_time 推断一致
 */

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const USER_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_TIME = "09:00";          // 未指定时间时的默认时刻
export const DEFAULT_DURATION_MINUTES = 60;   // 未指定结束时间时的默认时长

/**
 * 将任意时间输入按北京时间解析为 Date 对象（表示同一时刻）。
 * 与原生 new Date() 的区别：能正确处理 +08:00 时区标记，
 * 且对无时区字符串不会误按设备本地时区解析。
 */
export function parseAsShanghai(input) {
  if (!input) return null;
  try {
    if (input instanceof Date) return new Date(input.getTime());
    if (typeof input !== "string") return null;
    // 已带时区 → 直接解析
    if (/[+-]\d{2}:\d{2}|Z$/.test(input)) {
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    }
    // 无时间部分 → 作为北京时间 00:00
    if (isDateOnly(input)) {
      const d = new Date(`${input}T00:00:00+08:00`);
      return isNaN(d.getTime()) ? null : d;
    }
    // 有日期时间但无时区 → 视为北京时间
    const d = new Date(`${input}+08:00`);
    return isNaN(d.getTime()) ? null : d;
  } catch (_) {
    return null;
  }
}

/** 获取 Date 对象在北京时间下的 YYYY-MM-DD */
export function toShanghaiDateStr(input) {
  const d = input instanceof Date ? input : parseAsShanghai(input);
  if (!d) return "";
  return d.toLocaleDateString("en-CA", { timeZone: USER_TIMEZONE });
}

/** 获取 Date 对象在北京时间下的 HH:mm */
export function toShanghaiTimeStr(input) {
  const d = input instanceof Date ? input : parseAsShanghai(input);
  if (!d) return "";
  return d.toLocaleTimeString("en-GB", {
    timeZone: USER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 把用户选择的日期（Date 对象，通常来自日历组件）和时间字符串（HH:mm，北京时间）
 * 组合成 UTC ISO 字符串。
 *
 * 例：用户选 2026-08-21 + 14:30（北京时间）→ 返回 "2026-08-21T06:30:00.000Z"
 */
export function composeShanghaiISO(dateObj, timeStr = DEFAULT_TIME) {
  if (!dateObj) return null;
  const datePart = toShanghaiDateStr(dateObj);
  if (!datePart) return null;
  const [hours = "09", minutes = "00"] = String(timeStr || DEFAULT_TIME).split(":");
  const iso = `${datePart}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+08:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** 将 UTC ISO 字符串按北京时间格式化为指定格式（date-fns format 语法） */
export function formatShanghai(isoString, formatStr) {
  if (!isoString) return "";
  const d = parseAsShanghai(isoString);
  if (!d) return "";
  const zoned = toZonedTime(d, USER_TIMEZONE);
  return format(zoned, formatStr);
}

/** 将 UTC ISO 字符串按北京时间格式化为简短日期时间 */
export function formatShanghaiDateTime(isoString) {
  return formatShanghai(isoString, "M月d日 HH:mm");
}

/** 将 UTC ISO 字符串按北京时间格式化为时间 */
export function formatShanghaiTime(isoString) {
  return formatShanghai(isoString, "HH:mm");
}

/** 获取当前时刻按北京时间解析的 Date 对象（推荐替代裸用 new Date()） */
export function getShanghaiNow() {
  return parseAsShanghai(new Date().toISOString());
}

/** 判断两个 ISO 时间是否在同一天（按北京时间） */
export function isSameShanghaiDay(a, b) {
  if (!a || !b) return false;
  return toShanghaiDateStr(a) === toShanghaiDateStr(b);
}

/**
 * 判断字符串是否为纯日期（YYYY-MM-DD 格式，无时间部分）
 */
export function isDateOnly(value) {
  if (!value || typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * 将任意时间输入规范化为带时区的 ISO 字符串。
 *
 * @param {string|Date} input - 输入值（ISO 字符串、YYYY-MM-DD、Date 对象）
 * @param {Object} options
 * @param {string} options.defaultTime - 缺失时间时使用的默认时刻 HH:mm (默认 09:00)
 * @param {boolean} options.endOfDay - 若为纯日期，是否取一天结束（23:59）
 * @returns {string|null} ISO 8601 字符串，失败返回 null
 */
export function normalizeToISO(input, options = {}) {
  if (!input) return null;

  const { defaultTime = DEFAULT_TIME, endOfDay = false } = options;

  try {
    // 纯日期：补充时间部分
    if (typeof input === "string" && isDateOnly(input)) {
      const time = endOfDay ? "23:59:00" : `${defaultTime}:00`;
      // 作为本地时间（Asia/Shanghai）解析
      return new Date(`${input}T${time}+08:00`).toISOString();
    }

    const d = input instanceof Date ? input : parseAsShanghai(input);
    if (!d || isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (_) {
    return null;
  }
}

/**
 * 根据用户输入判断任务是否为全天事件。
 * 规则：
 *   - 显式传入 is_all_day 优先
 *   - 仅日期（YYYY-MM-DD）→ 全天
 *   - 有具体时间 → 非全天
 */
export function inferIsAllDay({ is_all_day, reminder_time, end_time }) {
  if (typeof is_all_day === "boolean") return is_all_day;
  if (isDateOnly(reminder_time)) return true;
  if (!reminder_time && isDateOnly(end_time)) return true;
  return false;
}

/**
 * 标准化一个"时间段"，填充缺失字段。
 *
 * 输入可能的情况：
 *   - 只有 reminder_time        → 补 end_time = +1 小时（非全天）
 *   - 只有 end_time             → 补 reminder_time = -1 小时
 *   - 全天但只有一个日期        → end_time = reminder_time
 *   - 都有                       → 规范化为 ISO
 *   - 都没有                     → 使用 fallback 日期 09:00
 *
 * @param {Object} raw
 * @param {string|Date} raw.reminder_time
 * @param {string|Date} raw.end_time
 * @param {boolean} raw.is_all_day
 * @param {string} fallbackDate - YYYY-MM-DD，全部缺失时的兜底日期
 * @returns {{reminder_time: string|null, end_time: string|null, is_all_day: boolean}}
 */
export function normalizeTimeRange(raw = {}, fallbackDate = null) {
  const isAllDay = inferIsAllDay(raw);
  const today = fallbackDate || toShanghaiDateStr(getShanghaiNow());

  let start = normalizeToISO(raw.reminder_time, {
    defaultTime: DEFAULT_TIME,
  });
  let end = normalizeToISO(raw.end_time, {
    defaultTime: DEFAULT_TIME,
    endOfDay: isAllDay,
  });

  // 两者都缺 → 兜底
  if (!start && !end) {
    start = normalizeToISO(today, { defaultTime: DEFAULT_TIME });
  }

  // 只有结束 → 反推开始
  if (!start && end) {
    start = new Date(new Date(end).getTime() - DEFAULT_DURATION_MINUTES * 60000).toISOString();
  }

  // 只有开始：全天任务 end = start；否则 +1 小时
  if (start && !end) {
    if (isAllDay) {
      end = start;
    } else {
      end = new Date(new Date(start).getTime() + DEFAULT_DURATION_MINUTES * 60000).toISOString();
    }
  }

  return {
    reminder_time: start,
    end_time: end,
    is_all_day: isAllDay,
  };
}

/**
 * 获取"今日在北京时间下的日期字符串"，同时返回该日期对应的 Date 对象（指向当地 00:00）。
 */
function getShanghaiToday() {
  const now = new Date();
  const todayDate = now.toLocaleDateString("en-CA", { timeZone: USER_TIMEZONE }); // YYYY-MM-DD
  // 以北京时间 00:00 构造 Date 对象用于日期计算
  const baseDate = new Date(`${todayDate}T00:00:00+08:00`);
  return { todayDate, baseDate };
}

/** 把 Date 按北京时区格式化为 YYYY-MM-DD */
function toDateStr(d) {
  return d.toLocaleDateString("en-CA", { timeZone: USER_TIMEZONE });
}

/** 在 baseDate 上加 n 天，返回 YYYY-MM-DD 字符串 */
function addDaysStr(baseDate, n) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

/** 计算：从 baseDate 起下一个指定星期几（0=周日, 1=周一 ... 6=周六）；includeToday=true 时若今日即该日则返回今日 */
function nextWeekdayStr(baseDate, targetDow, includeToday = false) {
  const d = new Date(baseDate);
  const cur = d.getUTCDay();
  let diff = (targetDow - cur + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateStr(d);
}

/** 下周(下一个自然周，周一起算)的指定星期几 */
function nextWeekWeekdayStr(baseDate, targetDow) {
  // 先找到本周一
  const d = new Date(baseDate);
  const cur = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 周日记为7
  d.setUTCDate(d.getUTCDate() - (cur - 1)); // 本周一
  d.setUTCDate(d.getUTCDate() + 7); // 下周一
  const dow = d.getUTCDay();
  const diff = (targetDow - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateStr(d);
}

/** 下个月第一个指定星期几 */
function firstWeekdayOfNextMonthStr(baseDate, targetDow) {
  const d = new Date(baseDate);
  d.setUTCMonth(d.getUTCMonth() + 1, 1); // 下月1号
  const dow = d.getUTCDay();
  const diff = (targetDow - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateStr(d);
}

/** 下个月月末 */
function lastDayOfNextMonthStr(baseDate) {
  const d = new Date(baseDate);
  d.setUTCMonth(d.getUTCMonth() + 2, 0); // 下下月的第0天 = 下月最后一天
  return toDateStr(d);
}

/**
 * 获取 AI prompt 中使用的"当前时间上下文"片段。
 * 包含预计算的关键相对日期锚点，减少 AI 推算错误。
 */
export function getTimeContextForAI() {
  const now = new Date();
  const shanghaiStr = now.toLocaleString("zh-CN", {
    timeZone: USER_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "long", hour12: false,
  });
  const isoNow = now.toISOString();
  const { todayDate, baseDate } = getShanghaiToday();

  // 预计算常用相对日期，作为 AI 的确定性锚点
  const tomorrow = addDaysStr(baseDate, 1);
  const dayAfterTomorrow = addDaysStr(baseDate, 2); // 后天
  const threeDaysLater = addDaysStr(baseDate, 3);   // 大后天
  const inSevenDays = addDaysStr(baseDate, 7);      // 一周后

  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  // 本周各日
  const thisWeek = {};
  for (let i = 1; i <= 6; i++) thisWeek[weekdayNames[i]] = nextWeekdayStr(baseDate, i, true);
  thisWeek['周日'] = nextWeekdayStr(baseDate, 0, true);
  // 下周各日
  const nextWeek = {};
  for (let i = 1; i <= 6; i++) nextWeek[weekdayNames[i]] = nextWeekWeekdayStr(baseDate, i);
  nextWeek['周日'] = nextWeekWeekdayStr(baseDate, 0);

  // 下个月第一个周X
  const firstOfNextMonth = {};
  for (let i = 1; i <= 6; i++) firstOfNextMonth[weekdayNames[i]] = firstWeekdayOfNextMonthStr(baseDate, i);
  firstOfNextMonth['周日'] = firstWeekdayOfNextMonthStr(baseDate, 0);

  const nextMonthEnd = lastDayOfNextMonthStr(baseDate);

  // 当前小时/分钟（北京时间）
  const hourStr = now.toLocaleString("en-GB", { timeZone: USER_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });

  const anchors = {
    今天: todayDate,
    明天: tomorrow,
    后天: dayAfterTomorrow,
    大后天: threeDaysLater,
    一周后: inSevenDays,
    本周: thisWeek,
    下周: nextWeek,
    下个月第一个: firstOfNextMonth,
    下月月底: nextMonthEnd,
  };

  const promptSnippet = `
【时间上下文 - 严格按此计算】
- 当前时间（北京时间）: ${shanghaiStr}
- ISO 格式: ${isoNow}
- 今日日期: ${todayDate}
- 当前时刻: ${hourStr}
- 用户时区: ${USER_TIMEZONE} (UTC+8)

【预计算的日期锚点 - 必须使用这些值，不要自己推算】
- 明天 = ${tomorrow}
- 后天 = ${dayAfterTomorrow}
- 大后天 = ${threeDaysLater}
- 一周后 = ${inSevenDays}
- 本周一=${thisWeek['周一']} 本周二=${thisWeek['周二']} 本周三=${thisWeek['周三']} 本周四=${thisWeek['周四']} 本周五=${thisWeek['周五']} 本周六=${thisWeek['周六']} 本周日=${thisWeek['周日']}
- 下周一=${nextWeek['周一']} 下周二=${nextWeek['周二']} 下周三=${nextWeek['周三']} 下周四=${nextWeek['周四']} 下周五=${nextWeek['周五']} 下周六=${nextWeek['周六']} 下周日=${nextWeek['周日']}
- 下个月第一个周一=${firstOfNextMonth['周一']} 周二=${firstOfNextMonth['周二']} 周三=${firstOfNextMonth['周三']} 周四=${firstOfNextMonth['周四']} 周五=${firstOfNextMonth['周五']} 周六=${firstOfNextMonth['周六']} 周日=${firstOfNextMonth['周日']}
- 下月月底 = ${nextMonthEnd}

【相对时间段映射 - 基于当前时刻精确计算】
- "马上/立刻/现在" = 当前时刻 + 1 分钟
- "X分钟后" / "X分钟之后" / "X分钟以后" = 当前时刻加 X 分钟
- "X小时后" / "X小时之后" / "X小时以后" = 当前时刻加 X 小时
- "半小时后" = 当前时刻 + 30 分钟；"一刻钟后" = 当前时刻 + 15 分钟
- "早上/上午" = 09:00；"中午" = 12:00；"下午" = 15:00；"傍晚" = 18:00；"晚上/今晚" = 20:00；"深夜/半夜" = 22:00；"凌晨" = 00:00

【时间输出规则 - 严格遵守】
1. 所有带时刻的时间字段必须输出为 ISO 8601 格式，带 +08:00 时区，例如："2025-04-22T15:00:00+08:00"
2. 全天事件使用纯日期格式 "YYYY-MM-DD"，并设置 is_all_day: true
3. 未指定具体时间的任务，默认为当天 09:00
4. 未指定结束时间的非全天任务，end_time 可以省略（调用方默认 +1 小时）
5. 解析"后天下午3点"：直接使用"后天=${dayAfterTomorrow}" + "下午=15:00" → "${dayAfterTomorrow}T15:00:00+08:00"
6. 解析"十分钟后"：基于当前时刻（${hourStr}）精确加 10 分钟，输出带 +08:00 的 ISO
7. 解析"两小时后"：基于当前时刻（${hourStr}）精确加 2 小时，输出带 +08:00 的 ISO
8. 解析"下个月第一个周一"：直接使用"下个月第一个周一=${firstOfNextMonth['周一']}"
9. "X点前" / "截止X点" / "X点前提醒"：reminder_time 取 X 点整（不是 X 点前的任意时刻）。例如"5点前"→"今天/明天T17:00:00+08:00"，"1点前"→"今天/明天T13:00:00+08:00"
`.trim();

  return {
    now_iso: isoNow,
    now_local: shanghaiStr,
    today_date: todayDate,
    current_time: hourStr,
    timezone: USER_TIMEZONE,
    anchors,
    promptSnippet,
  };
}

/**
 * 解析中文相对时间表达，返回需要加的分钟数。
 * 支持：X分钟后/之后/以后、过X分钟、等X分钟、半小时后、一刻钟后、马上/立刻/现在就。
 * 返回 null 表示未识别到相对时间。
 */
export function parseRelativeMinutes(text) {
  if (!text) return null;
  const t = text.trim();
  if (/马上|立刻|立即|现在就/.test(t)) return 1;
  if (/半小时(?:之?后|以后)|过半小时|等半小时/.test(t)) return 30;
  if (/一刻钟(?:之?后|以后)|过一刻钟|等一刻钟/.test(t)) return 15;
  // "过5分钟" / "等5分钟" / "再等5分钟"
  const passMatch = t.match(/(?:过|等|再等)\s*(\d+)\s*分钟/);
  if (passMatch) return parseInt(passMatch[1], 10);
  // "5分钟后" / "5分钟之后" / "5分钟以后" / "5分钟"
  const match = t.match(/(\d+)\s*分钟(?:之?后|以后)?/);
  if (match) return parseInt(match[1], 10);
  // "几分钟后" / "几分钟之后"
  if (/几\s*分钟(?:之?后|以后)?/.test(t)) return 5;
  // 中文数字："五分钟后"、"十五分钟后"、"一个半钟头"中的分钟部分
  const cnPassMatch = t.match(/(?:过|等|再等)\s*([一二两三四五六七八九十百千万]+)\s*分钟/);
  if (cnPassMatch) return parseCnNumber(cnPassMatch[1]);
  const cnMatch = t.match(/([一二两三四五六七八九十百千万]+)\s*分钟(?:之?后|以后)?/);
  if (cnMatch) return parseCnNumber(cnMatch[1]);
  return null;
}

/**
 * 解析中文相对小时表达，返回需要加的小时数。
 * 支持：X小时后/之后/以后、过X小时、等X小时、一小时后、两小时后、半个钟头后、一个半钟头后。
 */
export function parseRelativeHours(text) {
  if (!text) return null;
  const t = text.trim();
  if (/半小时(?:之?后|以后)|过半小时|等半小时|半个钟头(?:之?后|以后)|过半个钟头|等半个钟头/.test(t)) return 0.5;
  if (/一小时(?:之?后|以后)|一个钟头(?:之?后|以后)|过一小时|等一小时/.test(t)) return 1;
  if (/两小时(?:之?后|以后)|两个钟头(?:之?后|以后)|过两小时|等两小时/.test(t)) return 2;
  // "一个半小时后" / "一个半钟头后" / "一小时半后"
  if (/一个半(?:小时|钟头)(?:之?后|以后)|一小时半(?:之?后|以后)|一钟头半(?:之?后|以后)/.test(t)) return 1.5;
  // "X个半小时后" / "X个半钟头后"
  const halfMatch = t.match(/(\d+|半|[一二两三四五六七八九十]+)个半(?:小时|钟头)(?:之?后|以后)?/);
  if (halfMatch) {
    const n = halfMatch[1] === "半" ? 0 : (parseInt(halfMatch[1], 10) || parseCnNumber(halfMatch[1]) || 0);
    return n + 0.5;
  }
  // "过2小时" / "等3小时"
  const passMatch = t.match(/(?:过|等|再等)\s*(\d+(?:\.5)?)\s*(?:小时|钟头)/);
  if (passMatch) return parseFloat(passMatch[1]);
  // "2小时后" / "2小时之后"
  const match = t.match(/(\d+(?:\.5)?)\s*(?:小时|钟头)(?:之?后|以后)?/);
  if (match) return parseFloat(match[1]);
  // 中文数字
  const cnPassMatch = t.match(/(?:过|等|再等)\s*([一二两三四五六七八九十百千万]+)\s*(?:小时|钟头)/);
  if (cnPassMatch) return parseCnNumber(cnPassMatch[1]);
  const cnMatch = t.match(/([一二两三四五六七八九十百千万]+)\s*(?:小时|钟头)(?:之?后|以后)?/);
  if (cnMatch) return parseCnNumber(cnMatch[1]);
  return null;
}

/**
 * 解析一天中的时段表达，返回 HH:mm 字符串（北京时间）。
 * 支持：早上/上午→09:00、中午→12:00、下午→15:00、傍晚→18:00、晚上/今晚→20:00、深夜/半夜→22:00、凌晨→00:00。
 * 若文本中包含具体时刻如"3点"、"15:00"，优先返回该时刻。
 */
export function parseTimeOfDay(text) {
  if (!text) return null;
  const t = text.trim();

  // 优先识别具体时刻："3点"、"3:00"、"15:00"、"下午3点"
  const hourMatch = t.match(/(\d{1,2})\s*[点:：]\s*(\d{1,2})?\s*(?:分)?/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1], 10);
    const minute = parseInt(hourMatch[2] || "0", 10);
    // 下午/晚上 3点 → 15:00；凌晨/早上 3点 → 03:00
    if (/下午|傍晚|晚上|今晚|深夜|半夜/.test(t) && hour < 12) hour += 12;
    if (/凌晨/.test(t) && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // 时段映射
  if (/凌晨/.test(t)) return "00:00";
  if (/早上|上午/.test(t)) return "09:00";
  if (/中午/.test(t)) return "12:00";
  if (/下午/.test(t)) return "15:00";
  if (/傍晚/.test(t)) return "18:00";
  if (/晚上|今晚/.test(t)) return "20:00";
  if (/深夜|半夜/.test(t)) return "22:00";
  return null;
}

/**
 * 解析"X点前"、"截止X点"、"X点前完成/提醒"等截止/提醒语义。
 * 返回 { type: 'before', timeStr, dateStr?, source }；dateStr 为可选的日期锚点（如"周五"、"明天"）。
 * 目前主要把 "X点前" 解析为当天的 X:00，供调用方根据当前时间决定是否顺延到第二天。
 */
export function parseBeforeTime(text) {
  if (!text) return null;
  const t = text.trim();

  // 匹配 "X点前"、"截止X点"、"X点之前"
  const hourMatch = t.match(/(?:截止|在|于)?\s*(\d{1,2})\s*[点:：]\s*(\d{1,2})?\s*(?:分)?\s*(?:前|之前|以前)/);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1], 10);
    const minute = parseInt(hourMatch[2] || "0", 10);
    if (/下午|傍晚|晚上|今晚/.test(t) && hour < 12) hour += 12;
    return {
      type: "before",
      timeStr: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      source: hourMatch[0],
    };
  }

  // "明天下午3点前"、"周五前"：先尝试在 getTimeContextForAI / parseHybridTime 中处理，这里只识别是否有"前"字
  if (/前|之前|以前/.test(t) && parseTimeOfDay(t)) {
    return {
      type: "before",
      timeStr: parseTimeOfDay(t),
      source: "time_of_day",
    };
  }

  return null;
}

/**
 * 解析组合时间表达，如 "明天下午3点"、"后天上午"、"下周一晚上"。
 * 返回 ISO 8601 字符串（UTC）或 null。
 */
export function parseHybridTime(text) {
  if (!text) return null;
  const t = text.trim();

  // 提取日期锚点
  let dateStr = "";
  const now = getShanghaiNow();
  const today = toShanghaiDateStr(now);

  if (/今天|今/.test(t)) dateStr = today;
  else if (/明天|明/.test(t)) dateStr = addDaysToDateStr(today, 1);
  else if (/后天/.test(t)) dateStr = addDaysToDateStr(today, 2);
  else if (/大后天/.test(t)) dateStr = addDaysToDateStr(today, 3);
  else if (/一周后|下周这?时候|七天后/.test(t)) dateStr = addDaysToDateStr(today, 7);
  else {
    // 本周/下周X
    const weekdayMap = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 天: 0 };
    const weekMatch = t.match(/(本|下)周([一二三四五六日天])/);
    if (weekMatch) {
      const targetDow = weekdayMap[weekMatch[2]];
      const base = new Date(`${today}T00:00:00+08:00`);
      const curDow = base.getUTCDay();
      let diff = (targetDow - curDow + 7) % 7;
      if (weekMatch[1] === "下" || (diff === 0 && /下周/.test(t))) {
        diff = diff === 0 ? 7 : diff;
      }
      if (weekMatch[1] === "下") diff += 7;
      dateStr = addDaysToDateStr(today, diff);
    }
  }

  if (!dateStr) return null;

  // 提取时刻，无则默认 09:00
  const timeStr = parseTimeOfDay(t) || DEFAULT_TIME;
  return composeShanghaiISO(new Date(`${dateStr}T00:00:00+08:00`), timeStr);
}

/** 在 YYYY-MM-DD 上加 n 天 */
function addDaysToDateStr(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: USER_TIMEZONE });
}

/**
 * 把 ISO 时间转换为 <input type="datetime-local"> 需要的本地格式（YYYY-MM-DDTHH:mm）。
 * 由于 input 不带时区，这里按北京时间显示，避免浏览器本地时区漂移。
 */
export function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  const d = parseAsShanghai(isoString);
  if (!d) return "";
  const date = toShanghaiDateStr(d);
  const time = toShanghaiTimeStr(d);
  return `${date}T${time}`;
}

/**
 * 把 <input type="datetime-local"> 的值（按北京时间理解）转回 UTC ISO 字符串。
 */
export function fromDatetimeLocalValue(localString) {
  if (!localString) return null;
  const [datePart, timePart] = localString.split("T");
  if (!datePart || !timePart) return null;
  return composeShanghaiISO(new Date(`${datePart}T00:00:00+08:00`), timePart);
}

function parseCnNumber(s) {
  if (!s) return null;
  const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000, 万: 10000 };
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (map[s[1]] || 0);
  if (s.endsWith("十")) return (map[s[0]] || 1) * 10;
  if (/^[一二两三四五六七八九十]+$/.test(s)) {
    let n = 0;
    for (const ch of s) n = n * 10 + (map[ch] || 0);
    return n || null;
  }
  return map[s] || null;
}

/**
 * 便捷函数：将一个 AI 返回的任务对象规范化到可直接存储为 Task 实体的形式。
 */
export function normalizeTaskTime(taskData, fallbackDate = null) {
  const { reminder_time, end_time, is_all_day } = normalizeTimeRange(
    {
      reminder_time: taskData.reminder_time,
      end_time: taskData.end_time,
      is_all_day: taskData.is_all_day,
    },
    fallbackDate
  );

  return {
    ...taskData,
    reminder_time,
    end_time,
    is_all_day,
  };
}