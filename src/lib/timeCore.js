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
 * 获取 AI prompt 中使用的"当前时间上下文"片段。
 * 所有调用 AI 解析时间的地方应使用此函数，保证上下文一致。
 */
export function getTimeContextForAI() {
  const now = new Date();
  const shanghaiStr = now.toLocaleString("zh-CN", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const isoNow = now.toISOString();
  const todayDate = now.toLocaleDateString("en-CA", { timeZone: USER_TIMEZONE }); // YYYY-MM-DD

  return {
    now_iso: isoNow,
    now_local: shanghaiStr,
    today_date: todayDate,
    timezone: USER_TIMEZONE,
    promptSnippet: `
【时间上下文】
- 当前时间（北京时间）: ${shanghaiStr}
- ISO 格式: ${isoNow}
- 今日日期: ${todayDate}
- 用户时区: ${USER_TIMEZONE} (UTC+8)

【时间输出规则 - 严格遵守】
1. 所有时间字段必须输出为 ISO 8601 格式，带 +08:00 时区，例如："2025-04-22T15:00:00+08:00"
2. 全天事件使用纯日期格式 "YYYY-MM-DD"，并设置 is_all_day: true
3. 未指定具体时间的任务，默认为当天 09:00
4. 未指定结束时间的非全天任务，默认持续 1 小时
5. 相对时间（"明天"、"下周三"、"后天下午"）必须基于上述"当前时间"精确计算
`.trim(),
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