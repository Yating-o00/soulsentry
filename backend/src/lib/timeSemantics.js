// 时间语义与提醒调度策略库
// 核心理念（见《时间提醒机制优化方案》）：不猜硬时间——没有明确时间就不制造虚假逾期；
// 提醒按"行动窗口 + 短延后序列 + 逾期衰减 + 每日预算"调度，而不是无限重复催促。

const pad = (n) => String(n).padStart(2, "0");

/** 把北京时间日期对象转成 +08:00 ISO 字符串 */
export function toChinaISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+08:00`;
}

// ---------- 一、时间语义分类 ----------

const COLLECTION_RE = /收集|持续|随时[记装]|不断补充|长期记录|留意|跟踪|积累|沉淀|汇总整理/;
const EXPLICIT_RE = /今天|明天|后天|大后天|周[一二三四五六七日天]|星期|礼拜|今晚|明晚|早上|早晨|上午|中午|下午|晚上|夜里|半夜|\d{1,2}[点:：]\d{1,2}|\d{1,2}点半|\d+\s*(分钟|小时|天|日|号|周|星期|月)(之|以)?后|半小时后|一刻钟后/;
const RANGE_RE = /这周|本周|下周|下下周|最近|近期|有空|找时间|晚些|稍后|过两天|之后|到时候|回头|改天|月底|月末|周末前|内完成|之内完成|以前完成/;
const WISH_RE = /想学|想看看|想去(看|旅|玩)|考虑一下?|也许|以后(再|有)|有空(再|的?时候?再)|心愿|愿望|憧憬|希望有朝/;

/**
 * 用户输入的时间语义分类：
 * - collection 持续收集型（收集箱，不设单一截止，不产生逾期）
 * - explicit   明确时间型（"明天上午10点开会"，要求提醒准确）
 * - range      时间范围型（"这周找时间调研"，行动窗口而非具体时刻）
 * - wish       意愿/愿望型（"想学心理学"，低压力待孵化）
 * - none       无任何时间表达（待安排，不制造虚假逾期）
 */
export function classifyTimeSemantics(text) {
  const t = String(text || "");
  if (COLLECTION_RE.test(t)) return "collection";
  if (EXPLICIT_RE.test(t)) return "explicit";
  if (RANGE_RE.test(t)) return "range";
  if (WISH_RE.test(t)) return "wish";
  return "none";
}

/** 根据语义构建行动窗口：range→本周末；collection→每周窗口（供周回顾）；其余无窗口 */
export function buildTimePlan(semantics, now = new Date()) {
  const plan = { semantics, window_start: null, window_end: null, review_at: null, arranged: semantics === "explicit" };
  if (semantics === "range") {
    // 行动窗口：本周日晚 23:59（跨周输入"下周"由上层解析处理，这里给默认本周窗口）
    const end = new Date(now);
    const day = end.getDay() || 7; // 周一=1 … 周日=7
    end.setDate(end.getDate() + (7 - day));
    end.setHours(23, 59, 0, 0);
    plan.window_start = toChinaISO(now);
    plan.window_end = toChinaISO(end);
    plan.review_at = toChinaISO(end);
  } else if (semantics === "collection") {
    // 收集箱：每周日晚复盘一次
    const end = new Date(now);
    const day = end.getDay() || 7;
    end.setDate(end.getDate() + (7 - day));
    end.setHours(20, 0, 0, 0);
    plan.window_start = toChinaISO(now);
    plan.window_end = toChinaISO(end);
    plan.review_at = toChinaISO(end);
  } else if (semantics === "wish") {
    // 心愿：7 天后轻声回访一次"要不要安排"
    const review = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    review.setHours(20, 0, 0, 0);
    plan.review_at = toChinaISO(review);
  }
  return plan;
}

// ---------- 二、统一的逾期判定（多端对齐，替代 4 套各自实现） ----------

export function getTaskTimePlan(task) {
  const extra = task?.metadata && typeof task.metadata === "object" ? task.metadata._extraFields || {} : {};
  const plan = extra.time_plan;
  return plan && typeof plan === "object" && plan.semantics ? plan : null;
}

/**
 * 红色"硬逾期"判定：只有"明确时间型或用户已排期"且截止时间已过才算。
 * 待安排/心愿/纯收集不因时间流逝而变红——消除虚假逾期与心理债务。
 * 同时兼容 Prisma 实体（camelCase）与序列化输出（snake_case）。
 * 返回 { overdue, overdueDays, basis: "end"|"due"|"reminder"|null }
 */
export function getHardOverdue(task, now = new Date()) {
  const endTime = task?.endTime ?? task?.end_time;
  const dueAt = task?.dueAt ?? task?.due_at;
  const reminderTime = task?.reminderTime ?? task?.reminder_time;

  const plan = getTaskTimePlan(task);
  const semantics = plan?.semantics || ((dueAt || endTime) ? "explicit" : "none");
  const arranged = plan?.arranged || !!(dueAt || endTime) || semantics === "explicit";

  if (!arranged) return { overdue: false, overdueDays: 0, basis: null };
  if (semantics === "collection" && !(dueAt || endTime)) {
    return { overdue: false, overdueDays: 0, basis: null };
  }

  const basis = endTime ? "end" : dueAt ? "due" : reminderTime ? "reminder" : null;
  if (!basis) return { overdue: false, overdueDays: 0, basis: null };
  const t = new Date(basis === "end" ? endTime : basis === "due" ? dueAt : reminderTime);
  if (isNaN(t.getTime())) return { overdue: false, overdueDays: 0, basis: null };
  const diffMs = now.getTime() - t.getTime();
  if (diffMs <= 0) return { overdue: false, overdueDays: 0, basis };

  const overdueDays = Math.max(1, Math.ceil(diffMs / (24 * 3600 * 1000)));
  // 只有明确截止（end/due）过期才是硬逾期；仅提醒时间已过算"待处理"（soft，由 UI 决定展示）
  return { overdue: basis !== "reminder", overdueDays, basis, soft: basis === "reminder" };
}

// ---------- 三、短延后序列（5分钟 → 15分钟 → 当天静默） ----------

/** 第 n 次短延后（从 0 计）对应的再提醒分钟数；返回 null 表示当天不再打扰 */
export function nextShortSnoozeMinutes(shortCount) {
  if (shortCount <= 0) return 5;
  if (shortCount === 1) return 15;
  return null; // 已两次短延后：当天静默，进入晚间回顾
}

/** 判断当天是否已静默（22 点前不再短提醒） */
export function isQuietHours(now = new Date()) {
  const h = now.getHours();
  return h >= 22 || h < 7;
}

// ---------- 四、逾期衰减等级 ----------

/**
 * 逾期天数 → 处理等级：
 * recent        1-2 天：保留原优先级，提醒一次
 * reconfirm     3-7 天：询问是否拆小/改期/调整目标（一次）
 * low_freq      8-14 天：降低频率，进入"待复盘"（不主动推）
 * weekly_review >14 天：移出今日红色区，仅每周回顾
 * long_term     >30 天：进入"长期未决"，主动问一次（继续/改项目/归档/删除）
 */
export function overdueDecayStage(overdueDays) {
  if (overdueDays <= 2) return "recent";
  if (overdueDays <= 7) return "reconfirm";
  if (overdueDays <= 14) return "low_freq";
  if (overdueDays <= 30) return "weekly_review";
  return "long_term";
}

// ---------- 五、每日提醒预算 ----------

export const DAILY_REMINDER_BUDGET = 5; // 每日主动提醒上限（可调低，不可调高）

export function getDailyReminderUsage(preferences, dateStr) {
  const extra = preferences?.metadata && typeof preferences.metadata === "object" ? preferences.metadata._extraFields || {} : {};
  const usage = extra.daily_reminder_usage || {};
  return usage.date === dateStr ? usage.count || 0 : 0;
}

export function nextDailyReminderUsage(preferences, dateStr) {
  const extra = preferences?.metadata && typeof preferences.metadata === "object" ? preferences.metadata._extraFields || {} : {};
  const usage = extra.daily_reminder_usage || {};
  const count = usage.date === dateStr ? usage.count || 0 : 0;
  return { count: count + 1, date: dateStr };
}
