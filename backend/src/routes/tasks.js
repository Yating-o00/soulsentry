import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const tasksRouter = Router();

const taskInputSchema = z.object({
  title: z.string().min(1).max(120),
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
});

tasksRouter.use(requireAuth);

function toPrismaTaskStatus(status) {
  const normalized = String(status || "TODO").toUpperCase();
  if (normalized === "PENDING") return "TODO";
  if (["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"].includes(normalized)) return normalized;
  return "TODO";
}

function serializeTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status === "TODO" ? "pending" : task.status.toLowerCase(),
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
    metadata: task.metadata,
    created_date: task.createdAt,
    updated_date: task.updatedAt
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
    data: {
      userId: req.user.id,
      title: payload.data.title,
      description: payload.data.description,
      status: toPrismaTaskStatus(payload.data.status),
      priority: payload.data.priority || "medium",
      category: payload.data.category,
      dueAt: payload.data.due_at ? new Date(payload.data.due_at) : null,
      reminderTime: payload.data.reminder_time ? new Date(payload.data.reminder_time) : null,
      endTime: payload.data.end_time ? new Date(payload.data.end_time) : null,
      isAllDay: Boolean(payload.data.is_all_day),
      parentTaskId: payload.data.parent_task_id || null,
      gcalSyncEnabled: Boolean(payload.data.gcal_sync_enabled),
      progress: payload.data.progress ?? 0,
      completedAt: payload.data.completed_at ? new Date(payload.data.completed_at) : null,
      deletedAt: payload.data.deleted_at ? new Date(payload.data.deleted_at) : null,
      tags: payload.data.tags,
      reminderStrategy: payload.data.reminder_strategy,
      metadata: payload.data.metadata
    }
  });

  return res.status(201).json(serializeTask(task));
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
      metadata: payload.data.metadata
    }
  });

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
  return res.status(204).send();
});
