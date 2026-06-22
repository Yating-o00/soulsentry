import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const memoryRecordsRouter = Router();

const memoryRecordInputSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(10000).optional().nullable(),
  memory_type: z.string().optional(),
  emotion: z.string().optional(),
  event_date: z.string().datetime().optional().nullable(),
  people: z.any().optional(),
  locations: z.any().optional(),
  tags: z.any().optional(),
  ai_insight: z.any().optional(),
  source_task_id: z.string().optional().nullable(),
  source_note_id: z.string().optional().nullable(),
  is_pinned: z.boolean().optional()
});

memoryRecordsRouter.use(requireAuth);

function serializeMemoryRecord(item) {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    memory_type: item.memoryType,
    emotion: item.emotion,
    event_date: item.eventDate,
    people: item.people || [],
    locations: item.locations || [],
    tags: item.tags || [],
    ai_insight: item.aiInsight,
    source_task_id: item.sourceTaskId,
    source_note_id: item.sourceNoteId,
    is_pinned: item.isPinned,
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
    event_date: "eventDate",
    title: "title"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function buildMemoryRecordData(userId, payload) {
  return {
    userId,
    title: payload.title,
    content: payload.content,
    memoryType: payload.memory_type || "personal",
    emotion: payload.emotion || "neutral",
    eventDate: payload.event_date ? new Date(payload.event_date) : null,
    people: payload.people ?? [],
    locations: payload.locations ?? [],
    tags: payload.tags ?? [],
    aiInsight: payload.ai_insight,
    sourceTaskId: payload.source_task_id || null,
    sourceNoteId: payload.source_note_id || null,
    isPinned: payload.is_pinned ?? false
  };
}

memoryRecordsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.memory_type) where.memoryType = String(req.query.memory_type);
  if (req.query.source_task_id) where.sourceTaskId = String(req.query.source_task_id);
  if (req.query.source_note_id) where.sourceNoteId = String(req.query.source_note_id);
  if (req.query.is_pinned !== undefined) {
    where.isPinned = ["true", "1"].includes(String(req.query.is_pinned).toLowerCase());
  }
  if (req.query.created_by && String(req.query.created_by) !== req.user.email) {
    where.userId = "__none__";
  }
  if (req.query.created_by_id && String(req.query.created_by_id) !== req.user.id) {
    where.userId = "__none__";
  }

  const items = await prisma.memoryRecord.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(items.map(serializeMemoryRecord));
});

memoryRecordsRouter.get("/:id", async (req, res) => {
  const item = await prisma.memoryRecord.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include: { user: true }
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "记忆不存在" });
  }

  return res.json(serializeMemoryRecord(item));
});

memoryRecordsRouter.post("/", async (req, res) => {
  const payload = memoryRecordInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.memoryRecord.create({
    data: buildMemoryRecordData(req.user.id, payload.data),
    include: { user: true }
  });

  return res.status(201).json(serializeMemoryRecord(item));
});

memoryRecordsRouter.patch("/:id", async (req, res) => {
  const payload = memoryRecordInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.memoryRecord.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "记忆不存在" });
  }

  const item = await prisma.memoryRecord.update({
    where: { id: existing.id },
    data: {
      title: payload.data.title,
      content: payload.data.content,
      memoryType: payload.data.memory_type,
      emotion: payload.data.emotion,
      eventDate: payload.data.event_date === undefined ? undefined : (payload.data.event_date ? new Date(payload.data.event_date) : null),
      people: payload.data.people,
      locations: payload.data.locations,
      tags: payload.data.tags,
      aiInsight: payload.data.ai_insight,
      sourceTaskId: payload.data.source_task_id === undefined ? undefined : (payload.data.source_task_id || null),
      sourceNoteId: payload.data.source_note_id === undefined ? undefined : (payload.data.source_note_id || null),
      isPinned: payload.data.is_pinned
    },
    include: { user: true }
  });

  return res.json(serializeMemoryRecord(item));
});

memoryRecordsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.memoryRecord.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "记忆不存在" });
  }

  await prisma.memoryRecord.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
