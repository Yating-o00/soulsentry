import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const tasksRouter = Router();

const taskInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.string().optional(),
  priority: z.string().min(1).max(20).optional(),
  category: z.string().optional(),
  due_at: z.string().datetime().optional().nullable(),
  reminder_time: z.string().datetime().optional().nullable(),
  end_time: z.string().datetime().optional().nullable(),
  is_all_day: z.boolean().optional(),
  parent_task_id: z.string().optional().nullable(),
  gcal_sync_enabled: z.boolean().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  completed_at: z.string().datetime().optional().nullable(),
  deleted_at: z.string().datetime().optional().nullable(),
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
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.parent_task_id !== undefined) {
    const value = String(req.query.parent_task_id).trim();
    where.parentTaskId = value ? value : null;
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
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(tasks.map(serializeTask));
});

tasksRouter.get("/:id", async (req, res) => {
  const task = await prisma.task.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!task) {
    return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
  }

  return res.json(serializeTask(task));
});

tasksRouter.post("/", async (req, res) => {
  const payload = taskInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
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

  return res.status(201).json(serializeTask(task));
});

tasksRouter.post("/batch", async (req, res) => {
  const payload = taskBatchInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
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

tasksRouter.patch("/:id", async (req, res) => {
  const payload = taskInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.task.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
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

  return res.json(serializeTask(task));
});

tasksRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.task.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
  }

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
