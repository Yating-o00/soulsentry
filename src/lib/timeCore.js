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

export const USER_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_TIME = "09:00";          // 未指定时间时的默认时刻
export const DEFAULT_DURATION_MINUTES = 60;   // 未指定结束时间时的默认时长

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

    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return null;
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
  const today = fallbackDate || new Date().toISOString().slice(0, 10);

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

【相对时间段映射】
- 早上/上午 = 09:00    中午 = 12:00    下午 = 15:00    傍晚 = 18:00    晚上 = 20:00    深夜 = 22:00
- "X分钟后"/"X小时后" = 基于上方"当前时间"精确累加，结果用 ISO 8601 带 +08:00

【时间输出规则 - 严格遵守】
1. 所有带时刻的时间字段必须输出为 ISO 8601 格式，带 +08:00 时区，例如："2025-04-22T15:00:00+08:00"
2. 全天事件使用纯日期格式 "YYYY-MM-DD"，并设置 is_all_day: true
3. 未指定具体时间的任务，默认为当天 09:00
4. 未指定结束时间的非全天任务，end_time 可以省略（调用方默认 +1 小时）
5. 解析"后天下午3点"这类表达时：直接使用"后天=${dayAfterTomorrow}"加上"下午=15:00" → "${dayAfterTomorrow}T15:00:00+08:00"
6. 解析"十分钟后"：基于当前时刻（${hourStr}）精确加 10 分钟
7. 解析"下个月第一个周一"：直接使用"下个月第一个周一=${firstOfNextMonth['周一']}"
`.trim();

  return {
    now_iso: isoNow,
    now_local: shanghaiStr,
    today_date: todayDate,
    timezone: USER_TIMEZONE,
    anchors,
    promptSnippet,
  };
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