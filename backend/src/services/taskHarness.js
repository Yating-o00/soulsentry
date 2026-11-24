import { memoryTopicFor } from "./memoryLearning.js";
import { isTrainingGoal, validateTrainingSessions } from "./trainingWorkflow.js";

/** Run a bounded drafting workflow. Validation errors are returned to the
 * caller instead of presenting an invalid draft as a confirmed proposal. */
export async function runTaskHarness({ draft, validate, maxRepairs = 1, onAttempt }) {
  let errors = [];
  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    let result;
    try {
      result = await draft({ attempt, errors });
    } catch (error) {
      onAttempt?.({ attempt, errors: [], failed: true });
      return { status: "error", reason: error.name === "TimeoutError" || error.message === "PLAN_TIMEOUT" ? "timeout" : "provider_failure", message: error.message };
    }
    errors = validate(result);
    onAttempt?.({ attempt, errors });
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

const DAY_MS = 86400000;
const FREQUENCY = /(?:每周|一周|每星期)\s*([一二三四五六七两1-7])\s*次/g;
const WEEKDAY_EVENINGS_UNAVAILABLE = /(?:工作日|平日|周一至周五).{0,5}(?:晚上|晚间).{0,8}(?:没空|没有空|不方便|不能|不可用|无空)/;
const WEEKDAY_EVENINGS_ONLY = /(?:只在|只有|仅在|仅限).{0,4}(?:工作日|平日|周一至周五).{0,4}(?:晚上|晚间).{0,4}(?:有空|可以|方便)?/;
const DURATION = /(最多|不超过|只能|上限(?:是|为)?|正好|恰好)?\s*(半小时|[0-9一二两三四五六七八九十百]{1,4}\s*(?:分钟|小时))/;
const DIGITS = "零一二三四五六七八九";

function duration(text) {
  const match = String(text || "").match(DURATION);
  if (!match) return null;
  const value = match[2].replace(/\s/g, "").replace(/两/g, "二");
  if (value === "半小时") return { minutes: 30, mode: match[1] && !/正好|恰好/.test(match[1]) ? "max" : "exact" };
  const numeral = value.replace(/分钟|小时/, "");
  const chinese = /^(?:([一二三四五六七八九])百)?(?:([一二三四五六七八九])?(十))?([一二三四五六七八九])?$/.exec(numeral);
  const number = /^\d+$/.test(numeral) ? Number(numeral)
    : chinese && ((DIGITS.indexOf(chinese[1] || "零") * 100)
      + (chinese[3] ? DIGITS.indexOf(chinese[2] || "一") * 10 : 0)
      + DIGITS.indexOf(chinese[4] || "零"));
  const minutes = number * (value.endsWith("小时") ? 60 : 1);
  if (!minutes) return null;
  return { minutes, mode: match[1] && !/正好|恰好/.test(match[1]) ? "max" : "exact" };
}

/** Constrain the request from user evidence before letting model guesses reach the planner. */
export function resolvePlanningRequest(request, messages, memories, now = new Date()) {
  const latestPlan = messages.findLastIndex((text) =>
    /(?:帮|请|给|想|做|制定|安排|需要).{0,12}(?:规划|计划)|(?:规划|制定|安排).{0,12}(?:一周|每周|几天)/.test(text));
  const active = messages.slice(Math.max(0, latestPlan));
  const context = active.join(" ");
  const latest = active.at(-1) || "";
  const explicit = [...active].reverse().map((text) => {
    const clauses = [...text.matchAll(/(?:每次|单次|一次|一轮|每天)\s*([^，。；、]{1,22})/g)];
    return clauses.reverse().map((match) => duration(match[1])).find(Boolean) || duration(/^\s*(?:最多|不超过|正好)?(?:半小时|[一二两三四五六七八九十百0-9]+\s*(?:分钟|小时))[。！!\s]*$/.test(text) ? text : "");
  }).find(Boolean);
  const asksForMemory = /(?:按|用|遵循|照).{0,18}(?:上限|单次时长|最多|每次时长)/.test(context);
  const topic = memoryTopicFor(request.goal);
  const current = memories.filter(({ fact }) => fact?.subject === "self"
    && (!fact.status || fact.status === "active")
    && (!fact.expiresAt || new Date(fact.expiresAt) > now));
  const remembered = asksForMemory && topic ? current.filter(({ fact }) => fact.topic === topic && fact.attribute === "session_limit")
    .map((item) => ({ ...duration(item.content || item.title), id: item.id }))
    .filter(({ minutes, mode }) => minutes && mode === "max") : [];
  const values = new Set(remembered.map(({ minutes }) => minutes));
  const selected = asksForMemory && !explicit ? (values.size === 1 ? remembered[0] : null) : explicit;
  let clarification = null;
  const projectPlan = /(产品|上新|发布|上线|项目|运营|营销|活动|装修|婚礼|写作|作品|创业|launch|product|project|business)/i.test(
    `${request.goal || ""} ${context}`
  );
  if (!request.horizon_days) {
    clarification = { field: "horizon_days", fallback: "这个计划想坚持多少天？比如 7 天、14 天或 60 天～" };
  } else if (!selected && (!request.daily_minutes || !projectPlan)) {
    // 只有工作/项目型计划允许模型填入默认时长；学习/训练类需要用户给出真实可用时长
    clarification = {
      field: "daily_minutes",
      fallback: asksForMemory ? "这项安排每次最多能用多少分钟？我按你的上限来排～" : "每次大概能投入多少分钟？",
    };
  } else if (selected && (selected.minutes < 10 || selected.minutes > 180)) {
    clarification = { fallback: "每次可以安排 10 到 180 分钟，你想用多少分钟？" };
  }
  const resolved = { ...request, daily_minutes: selected?.minutes ?? request.daily_minutes };
  const availability = current.filter(({ fact }) => fact.topic === "calendar" && fact.attribute === "availability");
  const constraints = planningConstraints({
    goal: resolved.goal, horizonDays: resolved.horizon_days, sessionMinutes: resolved.daily_minutes,
    context, latestContext: latest, memories: availability,
  });
  if (selected?.mode === "max") {
    delete constraints.sessionMinutes;
    constraints.maxSessionMinutes = selected.minutes;
  }
  constraints.startDate = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  constraints.horizonDays = resolved.horizon_days;
  constraints.checkWindows = true;
  constraints.durationSource = selected?.id ? "memory" : selected ? "user" : "model";
  if (selected?.id) constraints.durationMemoryId = selected.id;
  if (selected?.mode === "exact") constraints.sessionMinutes = selected.minutes;
  if (constraints.training) {
    const lastEquipmentText = [...active].reverse().find((text) => /哑铃|杠铃|壶铃|弹力带|器械|健身房|自重/.test(text))
      || current.find(({ fact }) => fact.topic === "fitness" && fact.attribute === "equipment")?.content || "";
    constraints.dumbbellOnly = /(?:只有|仅有|只用|仅用|只有一副).{0,8}哑铃/.test(lastEquipmentText)
      && !/(?:和|还有|也有|加上).{0,4}(?:杠铃|壶铃|弹力带|器械)/.test(lastEquipmentText);
  }
  constraints.weekdayEveningsOnly = WEEKDAY_EVENINGS_ONLY.test(context);
  if (constraints.weekdayEveningsOnly && (constraints.noWeekdayEvenings || constraints.sessionsPerWeek > 5)) {
    clarification = { fallback: "工作日晚间与当前次数或禁排条件冲突，你还可以在哪些时段安排？" };
  }
  return { request: resolved, constraints, clarification };
}

function planWindow(day, start, end) {
  const begins = Date.parse(`${day}T${start}:00+08:00`);
  const ends = Date.parse(`${day}T${end}:00+08:00`);
  return { begins, ends };
}

export async function loadPlanningBusy(db, userId, constraints) {
  if (!constraints?.startDate || !constraints.horizonDays) return [];
  const start = new Date(`${constraints.startDate}T00:00:00+08:00`);
  const end = new Date(start.getTime() + constraints.horizonDays * DAY_MS);
  const tasks = await db.task.findMany({
    where: {
      userId, deletedAt: null, status: { notIn: ["DONE", "ARCHIVED"] },
      reminderTime: { lt: end }, endTime: { gt: start },
    },
    select: { reminderTime: true, endTime: true },
  });
  return tasks.filter(({ reminderTime, endTime }) => reminderTime && reminderTime < endTime)
    .map(({ reminderTime, endTime }) => ({ begins: reminderTime.getTime(), ends: endTime.getTime() }));
}

function windowsOverlap(a, b) {
  return a.begins < b.ends && b.begins < a.ends;
}

// Offer a feasible weekly schedule as an example. The final plan is still
// checked against all constraints and existing commitments.
export function suggestWeeklySlots(constraints, now = Date.now()) {
  const { startDate, horizonDays, sessionsPerWeek, sessionMinutes, maxSessionMinutes, busy = [] } = constraints;
  if (!constraints.checkWindows || !sessionsPerWeek || !startDate || horizonDays !== 7) return [];
  const dates = [];
  const duration = sessionMinutes ?? maxSessionMinutes;
  if (!duration) return [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const day = new Date(Date.parse(startDate) + offset * DAY_MS);
    const date = day.toISOString().slice(0, 10);
    const dayOfWeek = day.getUTCDay();
    const weekday = dayOfWeek > 0 && dayOfWeek < 6;
    if (constraints.weekdayEveningsOnly && !weekday) continue;
    const clocks = constraints.weekdayEveningsOnly ? ["19:00", "20:30"] : ["10:00", "14:00", "16:30", "19:00", "20:30"];
    const clock = clocks.find((time) => {
      const begins = Date.parse(`${date}T${time}:00+08:00`);
      const ends = begins + duration * 60000;
      return begins >= now + 30 * 60000
        && (!constraints.noWeekdayEvenings || !weekday || ends <= Date.parse(`${date}T18:00:00+08:00`))
        && !busy.some((block) => windowsOverlap({ begins, ends }, block));
    });
    if (clock) dates.push({ weekday: "日一二三四五六"[dayOfWeek], clock });
  }
  if (dates.length < sessionsPerWeek) return [];
  if (sessionsPerWeek === 1) return dates.slice(0, 1);
  return Array.from({ length: sessionsPerWeek }, (_, i) => dates[Math.round(i * (dates.length - 1) / (sessionsPerWeek - 1))]);
}

function checkWindows(children, constraints) {
  const start = Date.parse(`${constraints.startDate}T00:00:00+08:00`);
  const end = start + constraints.horizonDays * DAY_MS;
  const windows = children.map((c) => ({ ...planWindow(c.date, c.start_time, c.end_time), minutes: c.duration_minutes }))
    .sort((a, b) => a.begins - b.begins);
  const errors = [];
  if (windows.some((item) => !(item.begins >= start && item.begins < item.ends && item.ends <= end && item.ends - item.begins === item.minutes * 60000))) {
    errors.push("PLAN_WINDOW：安排须落在计划日期内，结束时间晚于开始时间");
  }
  if (windows.some((item, index) => index > 0 && windowsOverlap(item, windows[index - 1]))) {
    errors.push("PLAN_OVERLAP：计划内安排时间重叠");
  }
  if (windows.some((item) => constraints.busy?.some((block) => windowsOverlap(item, block)))) {
    errors.push("BUSY_CONFLICT：安排与用户已有约定时间冲突");
  }
  return errors;
}

export function planningConstraints({ goal, horizonDays, sessionMinutes, context, latestContext = context, memories = [] }) {
  const matches = [...String(context || "").matchAll(FREQUENCY)];
  const value = matches.at(-1)?.[1];
  const frequency = value ? ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 }[value] || Number(value)) : null;
  const unavailable = WEEKDAY_EVENINGS_UNAVAILABLE;
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
    return ["PLAN_EMPTY：计划没有可执行的安排"];
  }
  if (constraints.checkWindows) errors.push(...checkWindows(plan.children, constraints));
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
          errors.push(`SESSION_COUNT：第 ${Math.floor(offset / 7) + 1} 周需要${days === 7 ? "恰好" : "不超过"} ${constraints.sessionsPerWeek} 次，实际为 ${week.length} 次`);
        }
      }
    } else if (dates.size !== constraints.sessionsPerWeek || sessions.length !== constraints.sessionsPerWeek) {
      errors.push(`SESSION_COUNT：需要 ${constraints.sessionsPerWeek} 次训练或学习，实际为 ${sessions.length} 次，分布在 ${dates.size} 天`);
    }
  }
  if (constraints.sessionMinutes != null && sessions.some((session) => session.duration_minutes !== constraints.sessionMinutes)) {
    errors.push(`SESSION_DURATION：每次主要活动必须为 ${constraints.sessionMinutes} 分钟`);
  }
  if (constraints.maxSessionMinutes != null && sessions.some((session) => session.duration_minutes > constraints.maxSessionMinutes)) {
    errors.push(`SESSION_LIMIT：每次主要活动最多 ${constraints.maxSessionMinutes} 分钟`);
  }
  if (constraints.noWeekdayEvenings && sessions.some(({ date, start_time, end_time }) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return weekday >= 1 && weekday <= 5 && (start_time >= "18:00" || end_time > "18:00");
  })) errors.push("AVAILABILITY：工作日晚上不可安排：周一至周五的主要活动需在 18:00 前结束");
  if (constraints.weekdayEveningsOnly && sessions.some(({ date, start_time }) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return weekday < 1 || weekday > 5 || start_time < "18:00";
  })) errors.push("AVAILABILITY：主要活动只可安排在工作日晚间");
  if (constraints.training) errors.push(...validateTrainingSessions(sessions, constraints));
  return errors;
}
