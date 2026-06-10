import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const notesRouter = Router();

const createNoteSchema = z.object({
  title: z.string().max(120).optional(),
  content: z.string().min(1),
  status: z.enum(["ACTIVE", "ARCHIVED", "DELETED"]).optional()
});

notesRouter.use(requireAuth);

notesRouter.get("/", async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
    take: 100
  });

  return res.json(notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    status: note.status.toLowerCase(),
    created_date: note.createdAt,
    updated_date: note.updatedAt
  })));
});

notesRouter.post("/", async (req, res) => {
  const payload = createNoteSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const note = await prisma.note.create({
    data: {
      userId: req.user.id,
      title: payload.data.title,
      content: payload.data.content,
      status: payload.data.status
    }
  });

  return res.status(201).json({
    id: note.id,
    title: note.title,
    content: note.content,
    status: note.status.toLowerCase(),
    created_date: note.createdAt,
    updated_date: note.updatedAt
  });
});
