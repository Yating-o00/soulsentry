import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { maybeAutoExecute } from "../services/autoAutomation.js";
import { rejectIfRisky } from "../services/contentSecurity.js";
import { suggestTaskSplit } from "../services/splitTask.js";
import {
  assertTaskAccess,
  describeTaskChange,
  getSharedTaskIds,
  notifyTaskParties,
  taskAccess,
  withSharedInfo
} from "../services/taskSharing.js";

export const tasksRouter = Router();

const isoDateTime = z.string().refine(
  (v) => !Number.isNaN(Date.parse(v)),
  { message: "Invalid datetime" }
);

const taskInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.string().optional(),
  priority: z.string().min(1).max(20).optional(),
  category: z.string().optional(),
  due_at: isoDateTime.optional().nullable(),
  reminder_time: isoDateTime.optional().nullable(),
  end_time: isoDateTime.optional().nullable(),
  is_all_day: z.boolean().optional(),
  parent_task_id: z.string().optional().nullable(),
  gcal_sync_enabled: z.boolean().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  completed_at: isoDateTime.optional().nullable(),
  deleted_at: isoDateTime.optional().nullable(),
  tags: z.any().optional(),
  reminder_strategy: z.any().optional(),
  metadata: z.any().optional()
}).passthrough();

const taskBatchInputSchema = z.array(taskInputSchema).min(1).max(100);

const KNOWN_TASK_FIELDS = new Set([
  "title",
  "description",
  "status",
  "priority",
  "category",
  "due_at",
  "reminder_time",
  "end_time",
  "is_all_day",
  "parent_task_id",
  "gcal_sync_enabled",
  "progress",
  "completed_at",
  "deleted_at",
  "tags",
  "reminder_strategy",
  "metadata"
]);

tasksRouter.use(requireAuth);

function toPrismaTaskStatus(status) {
  const normalized = String(status || "TODO").toUpperCase();
  if (normalized === "PENDING") return "TODO";
  if (normalized === "COMPLETED") return "DONE";
  if (normalized === "DONE") return "DONE";
  if (normalized === "IN_PROGRESS" || normalized === "RUNNING" || normalized === "BLOCKED") return "IN_PROGRESS";
  if (["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"].includes(normalized)) return normalized;
  return "TODO";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getTaskExtraFields(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !KNOWN_TASK_FIELDS.has(key) && value !== undefined)
  );
}

function mergeTaskMetadata(existingMetadata, nextMetadata, extraFields = {}) {
  const baseMetadata = nextMetadata === undefined ? existingMetadata : nextMetadata;
  const hasExtraFields = Object.keys(extraFields).length > 0;

  if (baseMetadata === undefined && !hasExtraFields) {
    return undefined;
  }

  const normalized = isPlainObject(baseMetadata)
    ? { ...baseMetadata }
    : baseMetadata === undefined || baseMetadata === null
      ? {}
      : { _value: baseMetadata };

  const previousExtraFields = isPlainObject(normalized._extraFields)
    ? normalized._extraFields
    : {};

  if (hasExtraFields || Object.keys(previousExtraFields).length > 0) {
    normalized._extraFields = {
      ...previousExtraFields,
      ...extraFields
    };
  }

  return normalized;
}

function getSerializedTaskExtraFields(task) {
  const extraFields = isPlainObject(task?.metadata?._extraFields)
    ? task.metadata._extraFields
    : {};

  return Object.fromEntries(
    Object.entries(extraFields).filter(([, value]) => value !== undefined)
  );
}

function serializeTask(task) {
  const extraFields = getSerializedTaskExtraFields(task);

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status === "DONE"
      ? "completed"
      : task.status === "TODO"
        ? "pending"
        : task.status.toLowerCase(),
    priority: task.priority,
    category: task.category,
    due_at: task.dueAt,
    reminder_time: task.reminderTime,
    end_time: task.endTime,
    is_all_day: task.isAllDay,
    parent_task_id: task.parentTaskId,
    gcal_sync_enabled: task.gcalSyncEnabled,
    progress: task.progress,
    completed_at: task.completedAt,
    deleted_at: task.deletedAt,
    tags: task.tags,
    reminder_strategy: task.reminderStrategy,
    share_token: task.shareToken,
    share_enabled: task.shareEnabled,
    share_expires_at: task.shareExpiresAt,
    reminder_sent: !!extraFields.reminder_sent_at,
    reminder_sent_at: extraFields.reminder_sent_at || null,
    end_reminder_sent: !!(extraFields.end_reminder_sent_at && task.endTime && new Date(extraFields.end_reminder_sent_at).getTime() >= new Date(task.endTime).getTime()),
    ...extraFields,
    metadata: task.metadata,
    created_date: task.createdAt,
    updated_date: task.updatedAt
  };
}

function buildTaskCreateData(userId, payload) {
  const extraFields = getTaskExtraFields(payload);
  const title = String(payload.title || "").trim();

  return {
    userId,
    title: title.slice(0, 120),
    description: payload.description,
    status: toPrismaTaskStatus(payload.status),
    priority: payload.priority || "medium",
    category: payload.category,
    dueAt: payload.due_at ? new Date(payload.due_at) : null,
    reminderTime: payload.reminder_time ? new Date(payload.reminder_time) : null,
    endTime: payload.end_time ? new Date(payload.end_time) : null,
    isAllDay: Boolean(payload.is_all_day),
    parentTaskId: payload.parent_task_id || null,
    gcalSyncEnabled: Boolean(payload.gcal_sync_enabled),
    progress: payload.progress ?? 0,
    completedAt: payload.completed_at ? new Date(payload.completed_at) : null,
    deletedAt: payload.deleted_at ? new Date(payload.deleted_at) : null,
    tags: payload.tags,
    reminderStrategy: payload.reminder_strategy,
    metadata: mergeTaskMetadata(undefined, payload.metadata, extraFields)
  };
}

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    reminder_time: "reminderTime",
    due_at: "dueAt",
    title: "title"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function toDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "(空)";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldLabel(field) {
  const labels = {
    title: "标题",
    description: "描述",
    status: "状态",
    priority: "优先级",
    category: "分类",
    due_at: "截止时间",
    reminder_time: "提醒时间",
    end_time: "结束时间",
    completed_at: "完成时间",
    deleted_at: "删除时间",
    progress: "进度",
    attachments: "附件",
    dependencies: "依赖",
    notes: "笔记",
    revisions: "版本"
  };
  return labels[field] || field;
}

async function createTaskChangeLog(userId, task, changeType, payload = {}, previous = null) {
  const changedFields = Object.keys(payload || {}).filter((key) => key !== "metadata");
  const changesDetail = changedFields.map((field) => ({
    field,
    field_label: fieldLabel(field),
    old_value: toDisplayValue(previous?.[field]),
    new_value: toDisplayValue(payload?.[field])
  }));

  await prisma.taskChangeLog.create({
    data: {
      userId,
      taskId: task.id,
      parentTaskId: task.parentTaskId,
      changeType,
      taskTitle: task.title,
      changedFields,
      changesDetail
    }
  });
}

tasksRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  // 共有约定：本人所有 + 作为成员参与的约定（含其子约定）
  const sharedIds = await getSharedTaskIds(req.user.id);
  const where = sharedIds.length
    ? { OR: [{ userId: req.user.id }, { id: { in: sharedIds } }, { parentTaskId: { in: sharedIds } }] }
    : { userId: req.user.id };
  let needSharedInclude = sharedIds.length > 0;

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.parent_task_id !== undefined) {
    const value = String(req.query.parent_task_id).trim();
    if (value === "all") {
      // 不过滤
    } else if (value) {
      // 指定父约定：先校验访问权；共有约定的子约定可能分属双方，不再按 userId 过滤
      const parent = await prisma.task.findUnique({ where: { id: value }, include: { members: true } });
      if (!taskAccess(parent, req.user.id)) {
        return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
      }
      if (parent.members.length > 0 || parent.userId !== req.user.id) {
        for (const key of Object.keys(where)) delete where[key];
        needSharedInclude = true;
      }
      where.parentTaskId = value;
    } else {
      where.parentTaskId = null;
    }
  } else {
    // 默认只返回顶层约定，避免子约定出现在列表中
    where.parentTaskId = null;
  }
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.status) where.status = toPrismaTaskStatus(req.query.status);

  // 默认不返回已删除任务，避免前端删除后“视觉上消失但刷新又回来”
  if (req.query.deleted_at === undefined) {
    where.deletedAt = null;
  } else {
    const deletedQuery = String(req.query.deleted_at).trim().toLowerCase();
    if (deletedQuery === "null" || deletedQuery === "false" || deletedQuery === "0") {
      where.deletedAt = null;
    } else if (deletedQuery === "not_null" || deletedQuery === "true" || deletedQuery === "1") {
      where.deletedAt = { not: null };
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: needSharedInclude ? { user: true, members: true } : undefined
  });

  return res.json(tasks.map((task) => {
    const role = task.userId === req.user.id ? "owner" : (taskAccess(task, req.user.id) || "member");
    return withSharedInfo(serializeTask(task), task, role);
  }));
});

tasksRouter.get("/:id", async (req, res) => {
  const result = await assertTaskAccess(req, res, req.params.id);
  if (!result) return;
  return res.json(withSharedInfo(serializeTask(result.task), result.task, result.role));
});

tasksRouter.post("/", async (req, res) => {
  const payload = taskInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  // 内容安全：约定/子约定的标题与描述需通过 msgSecCheck
  if (await rejectIfRisky(res, `${payload.data.title || ""}\n${payload.data.description || ""}`, req.user.id)) return;

  // 在他人共有约定下新建子约定：需是该约定的成员
  if (payload.data.parent_task_id) {
    const parent = await prisma.task.findUnique({ where: { id: payload.data.parent_task_id }, include: { members: true } });
    if (parent && parent.userId !== req.user.id && !taskAccess(parent, req.user.id)) {
      return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
    }
  }

  const task = await prisma.task.create({
    data: buildTaskCreateData(req.user.id, payload.data)
  });

  await createTaskChangeLog(
    req.user.id,
    task,
    task.parentTaskId ? "subtask_created" : "created",
    payload.data
  );

  // 主动检测可自动执行的部分，异步执行后待用户验收（不阻塞创建）
  void maybeAutoExecute(task, req.user.id, prisma);

  return res.status(201).json(serializeTask(task));
});

tasksRouter.post("/batch", async (req, res) => {
  const payload = taskBatchInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  // 内容安全：批量创建前逐条检测标题与描述
  for (const item of payload.data) {
    if (await rejectIfRisky(res, `${item.title || ""}\n${item.description || ""}`, req.user.id)) return;
  }

  const tasks = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const item of payload.data) {
      const task = await tx.task.create({
        data: buildTaskCreateData(req.user.id, item)
      });

      await tx.taskChangeLog.create({
        data: {
          userId: req.user.id,
          taskId: task.id,
          parentTaskId: task.parentTaskId,
          changeType: task.parentTaskId ? "subtask_created" : "created",
          taskTitle: task.title,
          changedFields: Object.keys(item || {}).filter((key) => key !== "metadata"),
          changesDetail: []
        }
      });

      created.push(task);
    }

    return created;
  });

  return res.status(201).json(tasks.map(serializeTask));
});

tasksRouter.post("/:id/split", async (req, res) => {
  const task = await prisma.task.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!task) {
    return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
  }

  const result = await suggestTaskSplit(task);
  return res.json(result);
});

tasksRouter.patch("/:id", async (req, res) => {
  const payload = taskInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;
  const existing = access.task;

  // 共有成员可共同管理内容，但删除与归属变更仍属创建者
  if (access.role === "member" && payload.data.deleted_at !== undefined) {
    return res.status(403).json({ error: "FORBIDDEN", message: "共有约定仅创建者可删除" });
  }
  if (access.role === "member" && payload.data.parent_task_id !== undefined) {
    return res.status(403).json({ error: "FORBIDDEN", message: "共有成员不能变更约定的归属" });
  }

  const extraFields = getTaskExtraFields(payload.data);
  const nextMetadata = payload.data.metadata === undefined && Object.keys(extraFields).length === 0
    ? undefined
    : mergeTaskMetadata(existing.metadata, payload.data.metadata, extraFields);

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      title: payload.data.title,
      description: payload.data.description,
      status: payload.data.status ? toPrismaTaskStatus(payload.data.status) : undefined,
      priority: payload.data.priority,
      category: payload.data.category,
      dueAt: payload.data.due_at === undefined ? undefined : (payload.data.due_at ? new Date(payload.data.due_at) : null),
      reminderTime: payload.data.reminder_time === undefined ? undefined : (payload.data.reminder_time ? new Date(payload.data.reminder_time) : null),
      endTime: payload.data.end_time === undefined ? undefined : (payload.data.end_time ? new Date(payload.data.end_time) : null),
      isAllDay: payload.data.is_all_day,
      parentTaskId: payload.data.parent_task_id === undefined ? undefined : (payload.data.parent_task_id || null),
      gcalSyncEnabled: payload.data.gcal_sync_enabled,
      progress: payload.data.progress,
      completedAt: payload.data.completed_at === undefined ? undefined : (payload.data.completed_at ? new Date(payload.data.completed_at) : null),
      deletedAt: payload.data.deleted_at === undefined ? undefined : (payload.data.deleted_at ? new Date(payload.data.deleted_at) : null),
      tags: payload.data.tags,
      reminderStrategy: payload.data.reminder_strategy,
      metadata: nextMetadata
    }
  });

  const nextChangeType = payload.data.deleted_at
    ? (task.parentTaskId ? "subtask_deleted" : "deleted")
    : payload.data.status
      ? (task.parentTaskId ? "subtask_status_changed" : "status_changed")
      : (task.parentTaskId ? "subtask_updated" : "updated");

  await createTaskChangeLog(
    req.user.id,
    task,
    nextChangeType,
    payload.data,
    {
      title: existing.title,
      description: existing.description,
      status: serializeTask(existing).status,
      priority: existing.priority,
      category: existing.category,
      due_at: existing.dueAt?.toISOString?.() || null,
      reminder_time: existing.reminderTime?.toISOString?.() || null,
      end_time: existing.endTime?.toISOString?.() || null,
      completed_at: existing.completedAt?.toISOString?.() || null,
      deleted_at: existing.deletedAt?.toISOString?.() || null,
      progress: existing.progress
    }
  );

  // 标题/描述变更后重新检测可自动执行的部分（maybeAutoExecute 内部有去重）
  if (payload.data.title !== undefined || payload.data.description !== undefined) {
    void maybeAutoExecute(task, req.user.id, prisma);
  }

  // 共有约定：状态/内容等关键变更通知其他参与方（纯提醒稍后等不通知）
  const SIGNIFICANT_CHANGE_KEYS = ["status", "title", "description", "priority", "due_at", "completed_at", "deleted_at"];
  if (SIGNIFICANT_CHANGE_KEYS.some((key) => payload.data[key] !== undefined)) {
    await notifyTaskParties(task, req.user, describeTaskChange(req.user, task, payload.data));
  }

  // 约定直接勾掉完成时，关联的待验收/待批准/执行中的执行单一并自动验收归档，
  // 避免守护记录里残留「等你确认」的已完成约定
  if (task.status === "DONE" && existing.status !== "DONE") {
    try {
      const autoAccepted = await prisma.taskExecution.updateMany({
        where: {
          taskId: task.id,
          userId: req.user.id,
          executionStatus: { in: ["pending", "waiting_confirm", "executing", "waiting_acceptance", "failed"] }
        },
        data: {
          executionStatus: "completed",
          completedAt: new Date(),
          userFeedback: { auto_accepted: true, note: "约定已完成，自动验收" }
        }
      });
      if (autoAccepted.count > 0) {
        console.log(`[tasks] task=${task.id} 完成时自动验收执行单 ${autoAccepted.count} 条`);
      }
    } catch (err) {
      console.warn(`[tasks] task=${task.id} 自动验收执行单失败:`, err?.message || err);
    }
  }

  return res.json(serializeTask(task));
});

tasksRouter.delete("/:id", async (req, res) => {
  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;
  if (access.role !== "owner") {
    return res.status(403).json({ error: "FORBIDDEN", message: "共有约定需创建者删除，你可以选择退出共有" });
  }
  const existing = access.task;

  await notifyTaskParties(existing, req.user, {
    type: "shared_task_deleted",
    title: "共有约定已删除",
    body: `${req.user.displayName || req.user.email || "对方"} 删除了共有约定「${existing.title}」`
  });

  await prisma.task.delete({ where: { id: existing.id } });
  await createTaskChangeLog(
    req.user.id,
    existing,
    existing.parentTaskId ? "subtask_deleted" : "deleted",
    { deleted_at: new Date().toISOString() },
    {
      title: existing.title,
      description: existing.description,
      status: serializeTask(existing).status,
      priority: existing.priority,
      category: existing.category
    }
  );
  return res.status(204).send();
});

// GET /api/tasks/:id/members - 共有成员列表（创建者/成员可见）
tasksRouter.get("/:id/members", async (req, res) => {
  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;

  const members = await prisma.taskMember.findMany({
    where: { taskId: access.task.id },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });

  const serializeMember = (user, joinedAt, isOwner) => ({
    user_id: user.id,
    display_name: user.displayName || user.email || user.phone || "用户",
    email: user.email || null,
    is_owner: isOwner,
    is_self: user.id === req.user.id,
    joined_at: joinedAt || null
  });

  return res.json({
    task_id: access.task.id,
    my_role: access.role,
    owner: serializeMember(access.task.user, access.task.createdAt, true),
    members: members.map((m) => serializeMember(m.user, m.createdAt, false))
  });
});

// DELETE /api/tasks/:id/members/:userId - 创建者移除成员；成员移除自己=退出共有
tasksRouter.delete("/:id/members/:userId", async (req, res) => {
  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;

  const targetUserId = req.params.userId;
  if (targetUserId === access.task.userId) {
    return res.status(400).json({ error: "INVALID_TARGET", message: "创建者不在成员列表中" });
  }

  const isSelfLeave = targetUserId === req.user.id;
  if (!isSelfLeave && access.role !== "owner") {
    return res.status(403).json({ error: "FORBIDDEN", message: "仅创建者可移除成员" });
  }

  const membership = await prisma.taskMember.findUnique({
    where: { taskId_userId: { taskId: access.task.id, userId: targetUserId } }
  });
  if (!membership) {
    return res.status(404).json({ error: "NOT_FOUND", message: "成员不存在" });
  }

  await prisma.taskMember.delete({ where: { id: membership.id } });

  const taskTitle = access.task.title;
  if (isSelfLeave) {
    await notifyTaskParties(access.task, req.user, {
      type: "shared_task_left",
      title: "有成员退出共有约定",
      body: `${req.user.displayName || req.user.email || "对方"} 退出了共有约定「${taskTitle}」`
    });
  } else {
    try {
      await prisma.notification.create({
        data: {
          userId: targetUserId,
          title: "你已被移出共有约定",
          body: `创建者将你移出了共有约定「${taskTitle}」`,
          channel: "in_app",
          status: "SENT",
          payload: { type: "shared_task_removed", taskId: access.task.id }
        }
      });
    } catch (error) {
      console.error("[tasks] notify removed member failed:", error);
    }
  }

  return res.json({ removed: true, user_id: targetUserId });
});
