import { format, isSameDay, isAfter, isBefore, addDays, addWeeks, addMonths } from "date-fns";

/**
 * 生成重复任务在特定日期和小时的实例
 * @param {Object} task - 任务对象
 * @param {Date} date - 检查的日期
 * @param {number} hour - 检查的小时
 * @returns {boolean} - 该任务是否应该在此时间显示
 */
export const shouldTaskAppearAtDateTime = (task, date, hour) => {
  if (!task.reminder_time) return false;
  
  const taskDate = new Date(task.reminder_time);
  const taskStartHour = taskDate.getHours();
  const dateStr = format(date, "yyyy-MM-dd");
  const taskDateStr = format(taskDate, "yyyy-MM-dd");
  
  // 处理无重复规则的任务
  if (!task.repeat_rule || task.repeat_rule === "none") {
    if (dateStr !== taskDateStr) return false;
    
    // 检查是否在时间范围内
    if (task.end_time) {
      const endDate = new Date(task.end_time);
      const taskEndHour = endDate.getHours();
      return hour >= taskStartHour && hour <= taskEndHour;
    }
    
    return taskStartHour === hour;
  }
  
  // 获取任务的有效期范围
  const recurrence = task.custom_recurrence || {};
  const startDate = new Date(task.reminder_time);
  const endDate = recurrence.end_date ? new Date(recurrence.end_date) : null;
  
  // 检查日期是否在有效期范围内
  if (isBefore(date, startDate) || (endDate && isAfter(date, endDate))) {
    return false;
  }
  
  let shouldAppear = false;
  
  switch (task.repeat_rule) {
    case "daily":
      shouldAppear = true;
      break;
      
    case "weekly":
      const daysOfWeek = recurrence.days_of_week || [taskDate.getDay()];
      shouldAppear = daysOfWeek.includes(date.getDay());
      break;
      
    case "monthly":
      const daysOfMonth = recurrence.days_of_month || [taskDate.getDate()];
      shouldAppear = daysOfMonth.includes(date.getDate());
      break;
      
    case "custom":
      if (recurrence.frequency === "daily") {
        const interval = recurrence.interval || 1;
        const daysDiff = Math.floor((date - startDate) / (1000 * 60 * 60 * 24));
        shouldAppear = daysDiff % interval === 0;
      } else if (recurrence.frequency === "weekly") {
        const daysOfWeek = recurrence.days_of_week || [taskDate.getDay()];
        shouldAppear = daysOfWeek.includes(date.getDay());
      } else if (recurrence.frequency === "monthly") {
        const daysOfMonth = recurrence.days_of_month || [taskDate.getDate()];
        shouldAppear = daysOfMonth.includes(date.getDate());
      }
      break;
  }
  
  if (!shouldAppear) return false;
  
  // 检查是否在小时范围内
  if (task.end_time) {
    const endDatetime = new Date(task.end_time);
    const taskEndHour = endDatetime.getHours();
    return hour >= taskStartHour && hour <= taskEndHour;
  }
  
  return taskStartHour === hour;
};

/**
 * 获取任务在特定日期的开始小时
 * @param {Object} task - 任务对象
 * @param {Date} date - 日期
 * @returns {number|null} - 小时数，如果任务不适用则返回 null
 */
export const getTaskStartHourForDate = (task, date) => {
  if (!shouldTaskAppearAtDateTime(task, date, 0)) return null;
  
  const taskDate = new Date(task.reminder_time);
  return taskDate.getHours();
};