import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const noteCommentsRouter = Router();

const noteCommentInputSchema = z.object({
  note_id: z.string().min(1),
  content: z.string().min(1).max(5000),
  mentions: z.any().optional()
});

noteCommentsRouter.use(requireAuth);

function serializeNoteComment(comment) {
  return {
    id: comment.id,
    note_id: comment.noteId,
    content: comment.content,
    mentions: comment.mentions,
    created_by: comment.user?.email || null,
    created_date: comment.createdAt,
    updated_date: comment.updatedAt
  };
}

noteCommentsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const order = String(req.query.sort || "-created_date").startsWith("-") ? "desc" : "asc";
  const where = {};

  if (req.query.note_id) where.noteId = String(req.query.note_id);

  const comments = await prisma.noteComment.findMany({
    where,
    orderBy: { createdAt: order },
    include: { user: true },
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(comments.map(serializeNoteComment));
});

noteCommentsRouter.post("/", async (req, res) => {
  const payload = noteCommentInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const comment = await prisma.noteComment.create({
    data: {
      userId: req.user.id,
      noteId: payload.data.note_id,
      content: payload.data.content,
      mentions: payload.data.mentions
    },
    include: { user: true }
  });

  return res.status(201).json(serializeNoteComment(comment));
});

noteCommentsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.noteComment.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "评论不存在" });
  }

  await prisma.noteComment.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
