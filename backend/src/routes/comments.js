import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const commentsRouter = Router();

const commentSchema = z.object({
  task_id: z.string().min(1),
  content: z.string().min(1).max(5000),
  mentions: z.array(z.string()).optional()
});

commentsRouter.use(requireAuth);

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function serializeComment(comment) {
  return {
    id: comment.id,
    task_id: comment.taskId,
    content: comment.content,
    mentions: comment.mentions || [],
    created_by: comment.user?.email || "",
    created_by_id: comment.userId,
    created_date: comment.createdAt,
    updated_date: comment.updatedAt
  };
}

commentsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const where = {};
  if (req.query.task_id) where.taskId = String(req.query.task_id);
  const comments = await prisma.comment.findMany({
    where,
    orderBy: parseSort(req.query.sort),
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });
  return res.json(comments.map(serializeComment));
});

commentsRouter.post("/", async (req, res) => {
  const payload = commentSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const comment = await prisma.comment.create({
    data: {
      userId: req.user.id,
      taskId: payload.data.task_id,
      content: payload.data.content,
      mentions: payload.data.mentions || []
    },
    include: { user: true }
  });

  return res.status(201).json(serializeComment(comment));
});

commentsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.comment.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "评论不存在" });
  }

  await prisma.comment.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
