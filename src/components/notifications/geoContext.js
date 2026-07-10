// 通知的地理情境化：为工作/位置相关约定附加自然的地点上下文
export function buildGeoContextLine(task, savedLocations = []) {
  if (!task) return null;
  if (task.location_reminder?.enabled && task.location_reminder.location_name) {
    return `📍 相关地点：${task.location_reminder.location_name}，到达附近时别忘了`;
  }
  const text = `${task.title || ""} ${task.description || ""}`;
  const hit = (savedLocations || []).find(
    (l) => l && l.name && l.name.length >= 2 && text.includes(l.name)
  );
  if (hit) {
    return `📍 与「${hit.name}」相关${task.category === "work" ? "，在办公场景处理更顺手" : "，顺路即可完成"}`;
  }
  if (task.ai_analysis?.best_location) {
    return `📍 建议地点：${task.ai_analysis.best_location}`;
  }
  return null;
}