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
  const direct = taskAccess(task, userId);
  if (direct) return { task, role: direct };
  // 子约定本身没有直接授权时，沿父链向上查找：协同约定树的成员可管理整棵子约定树
  let parentId = task.parentTaskId;
  let guard = 0;
  while (parentId && guard < 10) {
    const parent = await prisma.task.findUnique({
      where: { id: parentId },
      include: { members: true, user: true }
    });
    if (!parent) break;
    const inherited = taskAccess(parent, userId);
    if (inherited) return { task, role: inherited };
    parentId = parent.parentTaskId;
    guard += 1;
  }
  return { task, role: null };
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

// 协同讨论 @成员：只通知被点名且确实在该约定里的成员（排除操作者自己）。
// payload.type=mention 会让左侧栏「消息通知」的未读 @ 红点自动亮起。
export async function notifyMentions(task, actor, { commentId, content, mentionedUserIds = [] }) {
  try {
    const requested = [...new Set((mentionedUserIds || []).map(String).filter(Boolean))].filter((id) => id !== actor.id);
    if (!task || requested.length === 0) return;
    const members = await prisma.taskMember.findMany({ where: { taskId: task.id }, select: { userId: true } });
    const allowed = new Set([task.userId, ...members.map((m) => m.userId)]);
    const recipients = requested.filter((id) => allowed.has(id));
    if (recipients.length === 0) return;
    const buddyId = task.metadata?._extraFields?.buddy_id || null;
    const link = buddyId
      ? `/buddyspace?buddy=${encodeURIComponent(buddyId)}&tab=${encodeURIComponent("协同")}&collab=${task.id}&messageId=${commentId}`
      : `/collabspace?taskId=${task.id}&messageId=${commentId}`;
    const plain = String(content || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
    for (const userId of recipients) {
      await prisma.notification.create({
        data: {
          userId,
          title: `${actorName(actor)} 在「${task.title}」@了你`,
          body: plain || "在协同讨论里提到了你",
          channel: "in_app",
          status: "SENT",
          payload: {
            type: "mention",
            taskId: task.id,
            commentId,
            actor: actorName(actor),
            link,
          },
        },
      });
    }
  } catch (error) {
    console.error("[taskSharing] notifyMentions failed:", error);
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
