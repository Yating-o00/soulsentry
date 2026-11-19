import { isTrainingGoal, validateTrainingSessions } from "./trainingWorkflow.js";

/** Run a bounded drafting workflow. Validation errors are returned to the
 * caller instead of presenting an invalid draft as a confirmed proposal. */
export async function runTaskHarness({ draft, validate, maxRepairs = 1 }) {
  let errors = [];
  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    let result;
    try {
      result = await draft({ attempt, errors });
    } catch (error) {
      return { status: "error", reason: "provider_failure", message: error.message };
    }
    errors = validate(result);
    if (errors.length === 0) return { status: "ready", result, attempts: attempt + 1 };
  }
  return { status: "invalid", errors, attempts: maxRepairs + 1 };
}

export function applyRememberedDuration(request, query, memories = []) {
  if (!request || !/(?:按|用|遵循|照).{0,18}(?:上限|单次时长|最多|每次时长)/.test(query)) return request;
  if (/(?:每次|单次|一次|一轮)[^，。；、]{0,10}(?:\d{1,3}|[一二两三四五六七八九十]{1,4})\s*(?:分钟|小时)/.test(query)) return request;
  const values = new Set();
  for (const item of memories) {
    if (item.fact?.attribute !== "session_limit") continue;
    const limit = String(item.content || item.title).match(/(?:最多|只能|不超过|上限(?:是|为)?)[^\d，。；]{0,6}(\d{1,3})\s*分钟/);
    if (limit && Number(limit[1]) >= 15 && Number(limit[1]) <= 180) values.add(Number(limit[1]));
  }
  return values.size === 1 ? { ...request, daily_minutes: [...values][0] } : request;
}

export function planningConstraints({ goal, horizonDays, sessionMinutes, context, latestContext = context, memories = [] }) {
  const matches = [...String(context || "").matchAll(/(?:每周|一周|每星期)\s*([一二三四五六七两1-7])\s*次/g)];
  const value = matches.at(-1)?.[1];
  const frequency = value ? ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 }[value] || Number(value)) : null;
  const unavailable = /(?:工作日|平日|周一至周五).{0,5}(?:晚上|晚间).{0,8}(?:没空|没有空|不方便|不能|不可用|无空)/;
  const latest = String(latestContext || "");
  const override = !unavailable.test(latest) && /(?:工作日|平日).{0,5}(?:晚上|晚间).{0,5}(?:也可以|可以|有空|没问题)/.test(latest);
  const noWeekdayEvenings = !override && (unavailable.test(String(context || ""))
    || memories.some(({ title, content }) => unavailable.test(content || title || "")));
  return {
    ...(frequency && horizonDays ? { sessionsPerWeek: frequency, sessionMinutes, horizonDays, startDate: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) } : {}),
    ...(isTrainingGoal(goal) ? { training: true } : {}),
    ...(noWeekdayEvenings ? { noWeekdayEvenings: true } : {}),
  };
}

/** Validate explicitly specified weekly frequency and session duration. */
export function validateScheduledSessions(plan, constraints) {
  const errors = [];
  if (!plan || !Array.isArray(plan.children) || plan.children.length === 0) {
    return ["计划没有可执行的安排"];
  }
  const sessions = plan.children.filter((child) => child.session_type === "session");
  if (constraints.sessionsPerWeek != null) {
    const dates = new Set(sessions.map((session) => session.date));
    if (constraints.horizonDays && constraints.horizonDays !== 7 && constraints.startDate) {
      const start = Date.parse(`${constraints.startDate}T00:00:00Z`);
      for (let offset = 0; offset < constraints.horizonDays; offset += 7) {
        const days = Math.min(7, constraints.horizonDays - offset);
        const week = sessions.filter((session) => {
          const day = Math.round((Date.parse(`${session.date}T00:00:00Z`) - start) / 86400000);
          return day >= offset && day < offset + days;
        });
        const weekDates = new Set(week.map((session) => session.date));
        if ((days === 7 && week.length !== constraints.sessionsPerWeek) || (days < 7 && week.length > constraints.sessionsPerWeek) || weekDates.size !== week.length) {
          errors.push(`第 ${Math.floor(offset / 7) + 1} 周需要${days === 7 ? "恰好" : "不超过"} ${constraints.sessionsPerWeek} 次，实际为 ${week.length} 次`);
        }
      }
    } else if (dates.size !== constraints.sessionsPerWeek || sessions.length !== constraints.sessionsPerWeek) {
      errors.push(`需要 ${constraints.sessionsPerWeek} 次训练或学习，实际为 ${sessions.length} 次，分布在 ${dates.size} 天`);
    }
  }
  if (constraints.sessionMinutes != null && sessions.some((session) => session.duration_minutes !== constraints.sessionMinutes)) {
    errors.push(`每次主要活动必须为 ${constraints.sessionMinutes} 分钟`);
  }
  if (constraints.noWeekdayEvenings && sessions.some(({ date, start_time, end_time }) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return weekday >= 1 && weekday <= 5 && (start_time >= "18:00" || end_time > "18:00");
  })) errors.push("工作日晚上不可安排：周一至周五的主要活动需在 18:00 前结束");
  if (constraints.training) errors.push(...validateTrainingSessions(sessions));
  return errors;
}
