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

export function planningConstraints({ goal, horizonDays, sessionMinutes, context }) {
  const matches = [...String(context || "").matchAll(/(?:每周|一周|每星期)\s*([一二三四五六七两1-7])\s*次/g)];
  const value = matches.at(-1)?.[1];
  const frequency = value ? ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 }[value] || Number(value)) : null;
  return {
    ...(frequency && horizonDays ? { sessionsPerWeek: frequency, sessionMinutes, horizonDays, startDate: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) } : {}),
    ...(isTrainingGoal(goal) ? { training: true } : {})
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
  if (constraints.training) errors.push(...validateTrainingSessions(sessions));
  return errors;
}
