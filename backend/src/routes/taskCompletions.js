import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const taskCompletionsRouter = Router();

const completionSchema = z.object({
  task_id: z.string().min(1),
  status: z.string().min(1),
  completed_at: z.string().datetime().optional().nullable(),
  note: z.string().optional().nullable()
});

taskCompletionsRouter.use(requireAuth);

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    completed_at: "completedAt",
    updated_date: "updatedAt"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function serializeCompletion(item) {
  return {
    id: item.id,
    task_id: item.taskId,
    status: item.status,
    completed_at: item.completedAt,
    note: item.note,
    created_date: item.createdAt,
    updated_date: item.updatedAt
  };
}

taskCompletionsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const where = { userId: req.user.id };
  if (req.query.task_id) where.taskId = String(req.query.task_id);
  const records = await prisma.taskCompletion.findMany({
    where,
    orderBy: parseSort(req.query.sort),
    take: Number.isFinite(limit) ? limit : 100
  });
  return res.json(records.map(serializeCompletion));
});

taskCompletionsRouter.post("/", async (req, res) => {
  const payload = completionSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const record = await prisma.taskCompletion.create({
    data: {
      userId: req.user.id,
      taskId: payload.data.task_id,
      status: payload.data.status,
      completedAt: payload.data.completed_at ? new Date(payload.data.completed_at) : null,
      note: payload.data.note || null
    }
  });

  return res.status(201).json(serializeCompletion(record));
});

taskCompletionsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.taskCompletion.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "完成记录不存在" });
  }

  await prisma.taskCompletion.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
