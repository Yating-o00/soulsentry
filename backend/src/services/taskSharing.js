import { prisma } from "../lib/prisma.js";

export async function getSharedTaskIds(userId) {
  if (!userId) return [];
  const rows = await prisma.taskMember.findMany({
    where: { userId },
    select: { taskId: true }
  });
  return rows.map((row) => row.taskId);
}

export function taskAccess(task, userId) {
  if (!task || !userId) return null;
  if (task.userId === userId) return "owner";
  if (Array.isArray(task.members) && task.members.some((m) => m.userId === userId)) return "member";
  return null;
}

export async function findTaskWithAccess(taskId, userId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { members: true, user: true }
  });
  if (!task) return { task: null, role: null };
  return { task, role: taskAccess(task, userId) };
}

// 无权限时统一 404，不泄露约定存在性；返回 null 表示已响应错误
export async function assertTaskAccess(req, res, taskId) {
  const { task, role } = await findTaskWithAccess(taskId, req.user.id);
  if (!task || !role) {
    res.status(404).json({ error: "NOT_FOUND", message: "约定不存在" });
    return null;
  }
  return { task, role };
}

export function withSharedInfo(serialized, task, role) {
  if (role !== "member") return serialized;
  return {
    ...serialized,
    shared_role: "member",
    owner_display_name: task.user?.displayName || task.user?.email || task.user?.phone || "对方"
  };
}

function actorName(user) {
  return user?.displayName || user?.email || user?.phone || "对方";
}

// 通知约定的其他参与方（创建者操作 → 全部成员；成员操作 → 创建者+其他成员）
export async function notifyTaskParties(task, actor, { type, title, body }) {
  try {
    const members = await prisma.taskMember.findMany({ where: { taskId: task.id } });
    const targets = new Set();
    if (actor.id !== task.userId) targets.add(task.userId);
    for (const member of members) {
      if (member.userId !== actor.id) targets.add(member.userId);
    }
    for (const userId of targets) {
      await prisma.notification.create({
        data: {
          userId,
          title,
          body,
          channel: "in_app",
          status: "SENT",
          payload: {
            type: type || "shared_task",
            taskId: task.id,
            actor: actorName(actor),
            link: `/tasks?taskId=${task.id}`
          }
        }
      });
    }
  } catch (error) {
    console.error("[taskSharing] notifyTaskParties failed:", error);
  }
}

export function describeTaskChange(actor, task, payload) {
  const name = actorName(actor);
  const status = String(payload.status || "").toUpperCase();
  if (payload.status !== undefined) {
    const done = status === "DONE" || status === "COMPLETED";
    return {
      type: "shared_task_status",
      title: done ? "共有约定已完成" : "共有约定状态变更",
      body: done
        ? `${name} 将共有约定「${task.title}」标记为已完成`
        : `${name} 将共有约定「${task.title}」重新打开`
    };
  }
  if (payload.deleted_at) {
    return { type: "shared_task_deleted", title: "共有约定已删除", body: `${name} 删除了共有约定「${task.title}」` };
  }
  return { type: "shared_task_updated", title: "共有约定有更新", body: `${name} 更新了共有约定「${task.title}」` };
}
