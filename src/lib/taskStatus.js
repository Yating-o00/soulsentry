// 重复约定的"完成"是打卡不杀系列：服务端只记 recurrence_last_done，status 保持活跃，
// 所以完成状态要按 done_today（北京日期）判断，与列表页/详情页口径统一
export const isRecurringTask = (t) => !!t?.repeat_rule && t.repeat_rule !== "none";

export const isTaskEffectivelyCompleted = (t) =>
  isRecurringTask(t) ? !!t.done_today : t?.status === "completed";
