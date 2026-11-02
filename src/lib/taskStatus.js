// 重复约定的"完成"是打卡不杀系列：服务端只记 recurrence_last_done，status 保持活跃，
// 所以完成状态要按 done_today（北京日期）判断，与列表页/详情页口径统一
export const isRecurringTask = (t) => !!t?.repeat_rule && t.repeat_rule !== "none";

export const isTaskEffectivelyCompleted = (t) =>
  isRecurringTask(t) ? !!t.done_today : t?.status === "completed";

// 智能规划组内条目三分：已完成（默认折叠）/ 临近（逾期+今天+未来 windowDays 天内，直接展示）/
// 远期（默认折叠在「未来 N 条」后）。北京日期口径，与用户时区无关；
// 避免「训练日」这类跨整段规划期的组一展开就把几十条全部铺开
export function splitPlanGroupItems(items, isCompleted = isTaskEffectivelyCompleted, windowDays = 3) {
  const shift = 8 * 3600 * 1000;
  const beijingNow = Date.now() + shift;
  const dayIndex = Math.floor(beijingNow / 86400000);
  const windowEndMs = (dayIndex + windowDays + 1) * 86400000; // 明天起 windowDays 天的末尾
  const done = [];
  const near = [];
  const far = [];
  for (const s of (Array.isArray(items) ? items : [])) {
    if (isCompleted(s)) {
      done.push(s);
      continue;
    }
    const t = s?.reminder_time ? new Date(s.reminder_time).getTime() : NaN;
    if (Number.isNaN(t)) {
      near.push(s);
      continue;
    }
    if (t + shift < windowEndMs) near.push(s);
    else far.push(s);
  }
  return { done, near, far };
}
