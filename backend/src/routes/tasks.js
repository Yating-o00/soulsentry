import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const tasksRouter = Router();

const createTaskSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"]).optional(),
  priority: z.string().min(1).max(20).optional(),
  due_at: z.string().datetime().optional()
});

tasksRouter.use(requireAuth);

tasksRouter.get("/", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return res.json(tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status.toLowerCase(),
    priority: task.priority,
    due_at: task.dueAt,
    created_date: task.createdAt,
    updated_date: task.updatedAt
  })));
});

tasksRouter.post("/", async (req, res) => {
  const payload = createTaskSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const task = await prisma.task.create({
    data: {
      userId: req.user.id,
      title: payload.data.title,
      description: payload.data.description,
      status: payload.data.status,
      priority: payload.data.priority || "medium",
      dueAt: payload.data.due_at ? new Date(payload.data.due_at) : null
    }
  });

  return res.status(201).json({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status.toLowerCase(),
    priority: task.priority,
    due_at: task.dueAt,
    created_date: task.createdAt,
    updated_date: task.updatedAt
  });
});
