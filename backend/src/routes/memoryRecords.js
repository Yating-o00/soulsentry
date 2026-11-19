import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  activeMemoryScope, createMemory, currentMemoryVersion, excludeSuppressedMemories, forgetMemory, memoryHistory, memoryInclude, memorySource,
  MemoryStoreError, restoreMemory, updateMemory,
} from "../services/memoryStore.js";
import { memoryLearningEnabled } from "../services/memoryWorker.js";

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

const versionSchema = z.number().int().min(1).max(2147483646);
const withMemoryError = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    if (error instanceof MemoryStoreError) return res.status(error.status).json({ error: error.code, message: error.message });
    if (["P2002", "P2034", "P2028", "P1008"].includes(error.code)) {
      return res.status(409).json({ error: "MEMORY_CONFLICT", message: "记忆正在更新，请刷新后再试" });
    }
    throw error;
  }
};

function serializeMemoryRecord(item) {
  return {
    id: item.id,
    version: currentMemoryVersion(item),
    memory_status: item.fact?.status === "superseded" ? "superseded"
      : item.fact?.expiresAt && item.fact.expiresAt <= new Date() ? "expired" : "active",
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
  const where = req.query.active === "true" ? activeMemoryScope(req.user.id) : { userId: req.user.id };

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
    include: memoryInclude
  });

  const visible = req.query.active === "true" ? await excludeSuppressedMemories(prisma, req.user.id, items) : items;
  return res.json(visible.map(serializeMemoryRecord));
});

memoryRecordsRouter.get("/learning", async (req, res) => {
  const state = await prisma.memoryWorkerState.findUnique({ where: { userId: req.user.id }, select: { enabled: true } });
  return res.json({ available: memoryLearningEnabled(), enabled: state?.enabled ?? true });
});

memoryRecordsRouter.put("/learning", async (req, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const { enabled } = parsed.data;
  const userId = req.user.id;
  await prisma.$transaction(async (tx) => {
    await tx.memoryWorkerState.upsert({
      where: { userId }, create: { userId, enabled },
      update: enabled ? { enabled } : { enabled, leaseToken: null, leaseUntil: null },
    });
    if (!enabled) await tx.memoryJob.deleteMany({ where: { userId, completedAt: null, failedAt: null } });
  });
  return res.json({ available: memoryLearningEnabled(), enabled });
});

memoryRecordsRouter.get("/:id", async (req, res) => {
  const item = await prisma.memoryRecord.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include: memoryInclude
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "记忆不存在" });
  }

  return res.json(serializeMemoryRecord(item));
});

memoryRecordsRouter.get("/:id/revisions", withMemoryError(async (req, res) => {
  const query = z.object({ before: z.coerce.number().int().min(1).max(2147483646).optional() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const history = await memoryHistory(prisma, { userId: req.user.id, id: req.params.id, beforeVersion: query.data.before });
  return res.json(history);
}));

memoryRecordsRouter.get("/:id/revisions/:version/source/:messageId", withMemoryError(async (req, res) => {
  const version = versionSchema.safeParse(Number(req.params.version));
  if (!version.success) return res.status(400).json({ error: "INVALID_INPUT" });
  return res.json(await memorySource(prisma, {
    userId: req.user.id, id: req.params.id, version: version.data, messageId: req.params.messageId,
  }));
}));

memoryRecordsRouter.post("/:id/restore", withMemoryError(async (req, res) => {
  const payload = z.object({ version: versionSchema, expected_version: versionSchema }).safeParse(req.body);
  if (!payload.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const item = await prisma.$transaction((tx) => restoreMemory(tx, {
    userId: req.user.id, id: req.params.id, version: payload.data.version, expectedVersion: payload.data.expected_version,
  }));
  return res.json(serializeMemoryRecord(item));
}));

memoryRecordsRouter.post("/", withMemoryError(async (req, res) => {
  const payload = memoryRecordInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.$transaction((tx) => createMemory(tx, {
    userId: req.user.id, data: buildMemoryRecordData(req.user.id, payload.data),
  }));

  return res.status(201).json(serializeMemoryRecord(item));
}));

memoryRecordsRouter.patch("/:id", withMemoryError(async (req, res) => {
  const payload = memoryRecordInputSchema.partial().extend({ expected_version: versionSchema.optional() }).safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.$transaction((tx) => updateMemory(tx, {
    userId: req.user.id, id: req.params.id, expectedVersion: payload.data.expected_version,
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
    }
  }));

  return res.json(serializeMemoryRecord(item));
}));

memoryRecordsRouter.delete("/:id", withMemoryError(async (req, res) => {
  await prisma.$transaction((tx) => forgetMemory(tx, { userId: req.user.id, id: req.params.id }));
  return res.status(204).send();
}));
