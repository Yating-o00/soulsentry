import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * ============================================================
 * AI 计划 → Task 实体 同步桥梁
 * ============================================================
 *
 * 当 DailyPlan / WeeklyPlan / MonthlyPlan 实体被创建或更新时，
 * 由实体自动化触发此函数，将计划中的事件自动转换为 Task 实体，
 * 并开启 Google Calendar 同步（gcal_sync_enabled=true）。
 *
 * 此函数是 AI 规划与日历同步之间的自动化桥梁，用户无需干预。
 *
 * 触发来源（实体 payload）：
 *   { event, data, old_data, payload_too_large }
 */

const TIMEZONE = "Asia/Shanghai";
const DEFAULT_TIME = "09:00";
const DEFAULT_DURATION_MIN = 60;

// ============================================================
// 时间规范化（与前端 lib/timeCore.js 逻辑保持一致）
// ============================================================

function isDateOnly(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function normalizeToISO(input, { defaultTime = DEFAULT_TIME, endOfDay = false } = {}) {
  if (!input) return null;
  try {
    if (typeof input === "string" && isDateOnly(input)) {
      const time = endOfDay ? "23:59:00" : `${defaultTime}:00`;
      return new Date(`${input}T${time}+08:00`).toISOString();
    }
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (_) {
    return null;
  }
}

function normalizeTimeRange(raw, fallbackDate) {
  const isAllDay = typeof raw.is_all_day === "boolean"
    ? raw.is_all_day
    : (isDateOnly(raw.reminder_time) || (!raw.reminder_time && isDateOnly(raw.end_time)));

  let start = normalizeToISO(raw.reminder_time);
  let end = normalizeToISO(raw.end_time, { endOfDay: isAllDay });

  if (!start && !end && fallbackDate) {
    start = normalizeToISO(fallbackDate);
  }
  if (!start && end) {
    start = new Date(new Date(end).getTime() - DEFAULT_DURATION_MIN * 60000).toISOString();
  }
  if (start && !end) {
    end = isAllDay
      ? start
      : new Date(new Date(start).getTime() + DEFAULT_DURATION_MIN * 60000).toISOString();
  }

  return { reminder_time: start, end_time: end, is_all_day: isAllDay };
}

// ============================================================
// 从各类 plan_json 中提取任务候选
// ============================================================

/**
 * 合并日期 + 时间字符串为 ISO
 * 示例：mergeDateTime("2025-04-22", "15:00") → "2025-04-22T15:00:00+08:00"
 */
function mergeDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) {
    return dateStr; // 只有日期
  }
  const [h, m] = timeStr.split(":");
  const hh = String(h || "09").padStart(2, "0");
  const mm = String(m || "00").padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:00+08:00`;
}

/**
 * 从 DailyPlan 提取任务
 * plan_json.key_tasks: [{ title, time, priority, category, ... }]
 * plan_json.focus_blocks: [{ title, start_time, end_time, ... }]
 */
function extractFromDailyPlan(plan, planDate) {
  const tasks = [];
  const pj = plan.plan_json || plan;

  (pj.key_tasks || []).forEach(t => {
    if (!t.title) return;
    const start = t.reminder_time || mergeDateTime(planDate, t.time);
    tasks.push({
      title: t.title,
      description: t.description || "",
      reminder_time: start,
      end_time: t.end_time,
      priority: t.priority || "medium",
      category: t.category || "personal",
    });
  });

  (pj.focus_blocks || []).forEach(b => {
    if (!b.title) return;
    const start = b.start_time || mergeDateTime(planDate, b.start || b.time);
    const end = b.end_time || mergeDateTime(planDate, b.end);
    tasks.push({
      title: `🎯 ${b.title}`,
      description: b.description || "专注时段",
      reminder_time: start,
      end_time: end,
      priority: "high",
      category: "work",
    });
  });

  return tasks;
}

/**
 * 从 WeeklyPlan 提取任务
 * plan_json.events: [{ date, day_index, title, time, type, ... }]
 */
function extractFromWeeklyPlan(plan, weekStartDate) {
  const tasks = [];
  const pj = plan.plan_json || plan;
  const baseDate = weekStartDate || pj.plan_start_date;

  (pj.events || []).forEach(ev => {
    if (!ev.title) return;
    let dateStr = ev.date;
    if (!dateStr && typeof ev.day_index === "number" && baseDate) {
      const d = new Date(`${baseDate}T00:00:00+08:00`);
      d.setDate(d.getDate() + ev.day_index);
      dateStr = d.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
    }
    if (!dateStr) return;

    const start = mergeDateTime(dateStr, ev.time);
    const categoryMap = { work: "work", meeting: "work", focus: "work", travel: "personal", rest: "personal" };

    tasks.push({
      title: ev.title,
      description: ev.icon ? `${ev.icon} ${ev.type || ""}` : (ev.type || ""),
      reminder_time: start,
      priority: ev.type === "meeting" ? "high" : "medium",
      category: categoryMap[ev.type] || "personal",
    });
  });

  return tasks;
}

/**
 * 从 MonthlyPlan 提取任务（仅 key_milestones，不提取 weeks_breakdown 避免噪音）
 * plan_json.key_milestones: [{ title, deadline (YYYY-MM-DD), type }]
 */
function extractFromMonthlyPlan(plan) {
  const tasks = [];
  const pj = plan.plan_json || plan;
  const categoryMap = { work: "work", personal: "personal", health: "health", study: "study" };

  (pj.key_milestones || []).forEach(m => {
    if (!m.title || !m.deadline) return;
    tasks.push({
      title: `🎯 ${m.title}`,
      description: "月度里程碑",
      reminder_time: m.deadline,
      is_all_day: true,
      priority: "high",
      category: categoryMap[m.type] || "work",
    });
  });

  return tasks;
}

// ============================================================
// 主处理函数
// ============================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let payload;
    try {
      payload = await req.json();
    } catch (_) {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { event, data } = payload || {};
    if (!event || !event.entity_name) {
      return Response.json({ error: 'Missing event' }, { status: 400 });
    }

    // 仅在 create / update 时处理
    if (event.type !== 'create' && event.type !== 'update') {
      return Response.json({ skipped: true, reason: 'not create/update' });
    }

    let planData = data;
    if (!planData && event.entity_id) {
      planData = await base44.asServiceRole.entities[event.entity_name].get(event.entity_id);
    }
    if (!planData) {
      return Response.json({ error: 'Plan data not available' }, { status: 404 });
    }

    // 根据实体类型提取任务候选
    let candidateTasks = [];
    let fallbackDate = null;

    if (event.entity_name === 'DailyPlan') {
      fallbackDate = planData.plan_date;
      candidateTasks = extractFromDailyPlan(planData, fallbackDate);
    } else if (event.entity_name === 'WeeklyPlan') {
      fallbackDate = planData.week_start_date;
      candidateTasks = extractFromWeeklyPlan(planData, fallbackDate);
    } else if (event.entity_name === 'MonthlyPlan') {
      fallbackDate = planData.month_start_date;
      candidateTasks = extractFromMonthlyPlan(planData);
    } else {
      return Response.json({ skipped: true, reason: 'unsupported entity' });
    }

    if (candidateTasks.length === 0) {
      return Response.json({ created: 0, reason: 'no extractable tasks' });
    }

    // 规范化时间 + 去重：按 owner + title 查询（无论状态/是否已完成/是否已软删都视为已存在）
    // 修复：之前用 _plan_source 做去重，但 Task 实体根本没有这个字段，
    // 导致每次 DailyPlan 更新都会把相同任务重新创建一次（包括用户已点击完成的）。
    const ownerEmail = planData.created_by;

    const normSameDay = (isoA, isoB) => {
      if (!isoA || !isoB) return false;
      const a = new Date(isoA), b = new Date(isoB);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
      return Math.abs(a.getTime() - b.getTime()) <= 10 * 60 * 1000;
    };

    // 计算 plan 所属日期的 [start, end) 区间（Asia/Shanghai）
    const planDayStart = fallbackDate ? new Date(`${fallbackDate}T00:00:00+08:00`).getTime() : null;
    const planDayEnd = fallbackDate ? new Date(`${fallbackDate}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000 : null;
    const sameDayAsPlan = (iso) => {
      if (!iso || planDayStart === null) return false;
      const t = new Date(iso).getTime();
      if (isNaN(t)) return false;
      return t >= planDayStart && t < planDayEnd;
    };

    const normalizeTitle = (s) => (s || "").trim().replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s🎯]+/u, "").toLowerCase();

    const created = [];
    for (const raw of candidateTasks) {
      const normalized = normalizeTimeRange(raw, fallbackDate);
      if (!normalized.reminder_time) continue;

      // 去重升级：
      //   1) 同 owner + 同 title 且时间 ±10 分钟 → 重复
      //   2) 同 owner + 同 title（忽略 emoji/大小写）且 reminder_time 落在 plan_date 当天 → 重复
      //      用于避免前端 SmartDailyPlanner 已把该项作为父任务的子约定挂载后，
      //      planToTasks 又重复创建一个顶层 Task。
      let dup = false;
      if (ownerEmail) {
        try {
          const normTitle = normalizeTitle(raw.title);
          const existing = await base44.asServiceRole.entities.Task.filter({
            created_by: ownerEmail,
          });
          dup = (existing || []).some(t => {
            if (!t || t.deleted_at) return false;
            if (normalizeTitle(t.title) !== normTitle) return false;
            if (normSameDay(t.reminder_time, normalized.reminder_time)) return true;
            if (sameDayAsPlan(t.reminder_time)) return true;
            return false;
          });
        } catch (_) {
          dup = false;
        }
      }
      if (dup) continue;

      const taskPayload = {
        title: raw.title,
        description: raw.description || "",
        reminder_time: normalized.reminder_time,
        end_time: normalized.end_time,
        is_all_day: normalized.is_all_day,
        priority: raw.priority || "medium",
        category: raw.category || "personal",
        status: "pending",
        gcal_sync_enabled: true, // 关键：开启日历同步
        tags: [`来自${event.entity_name === 'DailyPlan' ? '日' : event.entity_name === 'WeeklyPlan' ? '周' : '月'}规划`],
      };

      try {
        const t = await base44.asServiceRole.entities.Task.create(taskPayload);
        created.push({ id: t.id, title: t.title });
      } catch (err) {
        console.error('[planToTasks] Failed to create task:', raw.title, err?.message);
      }
    }

    console.log(`[planToTasks] ${event.entity_name} ${event.entity_id}: created ${created.length} tasks`);
    return Response.json({ created: created.length, tasks: created });
  } catch (error) {
    console.error('[planToTasks] Error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});