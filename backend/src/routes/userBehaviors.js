import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const userBehaviorsRouter = Router();

const userBehaviorInputSchema = z.object({
  event_type: z.string().min(1).max(120),
  task_id: z.string().optional().nullable(),
  hour_of_day: z.number().int().min(0).max(23).optional().nullable(),
  day_of_week: z.number().int().min(0).max(6).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  response_time_seconds: z.number().int().min(0).optional().nullable(),
  metadata: z.any().optional()
});

userBehaviorsRouter.use(requireAuth);

function serializeUserBehavior(item) {
  return {
    id: item.id,
    event_type: item.eventType,
    task_id: item.taskId,
    hour_of_day: item.hourOfDay,
    day_of_week: item.dayOfWeek,
    category: item.category,
    response_time_seconds: item.responseTimeSeconds,
    metadata: item.metadata,
    created_by_id: item.userId,
    created_by: item.user?.email || null,
    created_date: item.createdAt,
    updated_date: item.updatedAt
  };
}

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    event_type: "eventType"
  };
  return { [mapping[key] || "createdAt"]: order };
}

userBehaviorsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 500);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.event_type) where.eventType = String(req.query.event_type);
  if (req.query.task_id) where.taskId = String(req.query.task_id);
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.created_by && String(req.query.created_by) !== req.user.email) {
    where.userId = "__none__";
  }
  if (req.query.created_by_id && String(req.query.created_by_id) !== req.user.id) {
    where.userId = "__none__";
  }

  const items = await prisma.userBehavior.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(items.map(serializeUserBehavior));
});

userBehaviorsRouter.get("/:id", async (req, res) => {
  const item = await prisma.userBehavior.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include: { user: true }
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "行为记录不存在" });
  }

  return res.json(serializeUserBehavior(item));
});

userBehaviorsRouter.post("/", async (req, res) => {
  const payload = userBehaviorInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.userBehavior.create({
    data: {
      userId: req.user.id,
      eventType: payload.data.event_type,
      taskId: payload.data.task_id || null,
      hourOfDay: payload.data.hour_of_day ?? null,
      dayOfWeek: payload.data.day_of_week ?? null,
      category: payload.data.category || null,
      responseTimeSeconds: payload.data.response_time_seconds ?? null,
      metadata: payload.data.metadata
    },
    include: { user: true }
  });

  return res.status(201).json(serializeUserBehavior(item));
});
