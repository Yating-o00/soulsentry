// 协同约定空间的公共数据助手：子约定树收集、变更日志（collab_* 口径与 tasks.js createTaskChangeLog 对齐）
import { prisma } from "../lib/prisma.js";

// 收集 rootTask 下全部层级的存活子约定（BFS；SQLite 的 Prisma 不支持递归查询）
export async function collectSubtasks(rootTaskId) {
  const all = [];
  let frontier = [rootTaskId];
  while (frontier.length > 0) {
    const children = await prisma.task.findMany({
      where: { parentTaskId: { in: frontier }, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    if (children.length === 0) break;
    all.push(...children);
    frontier = children.map((child) => child.id);
  }
  return all;
}

// 把扁平子约定列表组装成树（返回原始 Task 对象，调用方负责序列化）
export function nestSubtasks(rootTaskId, subtasks) {
  const byParent = new Map();
  for (const task of subtasks) {
    const key = task.parentTaskId || rootTaskId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(task);
  }
  const build = (parentId) => (byParent.get(parentId) || []).map((task) => ({
    ...task,
    children: build(task.id)
  }));
  return build(rootTaskId);
}

// 协同空间写操作的变更日志：details = [{field, field_label, old_value?, new_value?}]
export async function logCollabChange(userId, task, changeType, details = []) {
  const normalized = details.map((detail) => ({
    field: detail.field,
    field_label: detail.field_label || detail.field,
    old_value: detail.old_value ?? null,
    new_value: detail.new_value ?? null
  }));
  await prisma.taskChangeLog.create({
    data: {
      userId,
      taskId: task.id,
      parentTaskId: task.parentTaskId || null,
      changeType,
      taskTitle: task.title,
      changedFields: normalized.map((detail) => detail.field),
      changesDetail: normalized
    }
  });
}
