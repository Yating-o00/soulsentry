import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const knowledgeBasesRouter = Router();

const knowledgeBaseInputSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  source_type: z.string().optional(),
  source_id: z.string().optional().nullable(),
  tags: z.any().optional(),
  category: z.string().max(120).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  key_points: z.any().optional(),
  embeddings: z.any().optional(),
  access_count: z.number().int().min(0).optional(),
  last_accessed: z.string().datetime().optional().nullable(),
  importance: z.number().int().min(1).max(5).optional(),
  embedding_summary: z.string().max(5000).optional().nullable(),
  metadata: z.any().optional()
});

knowledgeBasesRouter.use(requireAuth);

function serializeKnowledgeBase(item) {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    source_type: item.sourceType,
    source_id: item.sourceId,
    tags: item.tags || [],
    category: item.category,
    summary: item.summary,
    key_points: item.keyPoints || [],
    embeddings: item.embeddings,
    access_count: item.accessCount,
    last_accessed: item.lastAccessed,
    importance: item.importance,
    embedding_summary: item.embeddingSummary,
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
    last_accessed: "lastAccessed",
    access_count: "accessCount",
    importance: "importance",
    title: "title"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function buildKnowledgeBaseData(userId, payload) {
  return {
    userId,
    title: payload.title,
    content: payload.content,
    sourceType: payload.source_type || "manual",
    sourceId: payload.source_id || null,
    tags: payload.tags ?? [],
    category: payload.category || "其他",
    summary: payload.summary || null,
    keyPoints: payload.key_points ?? [],
    embeddings: payload.embeddings,
    accessCount: payload.access_count ?? 0,
    lastAccessed: payload.last_accessed ? new Date(payload.last_accessed) : null,
    importance: payload.importance ?? 3,
    embeddingSummary: payload.embedding_summary || null,
    metadata: payload.metadata
  };
}

knowledgeBasesRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 500);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.source_type) where.sourceType = String(req.query.source_type);
  if (req.query.source_id) where.sourceId = String(req.query.source_id);
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.importance) where.importance = Number(req.query.importance);
  if (req.query.created_by && String(req.query.created_by) !== req.user.email) {
    where.userId = "__none__";
  }
  if (req.query.created_by_id && String(req.query.created_by_id) !== req.user.id) {
    where.userId = "__none__";
  }

  const items = await prisma.knowledgeBase.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(items.map(serializeKnowledgeBase));
});

knowledgeBasesRouter.get("/:id", async (req, res) => {
  const item = await prisma.knowledgeBase.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include: { user: true }
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "知识条目不存在" });
  }

  return res.json(serializeKnowledgeBase(item));
});

knowledgeBasesRouter.post("/", async (req, res) => {
  const payload = knowledgeBaseInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.knowledgeBase.create({
    data: buildKnowledgeBaseData(req.user.id, payload.data),
    include: { user: true }
  });

  return res.status(201).json(serializeKnowledgeBase(item));
});

knowledgeBasesRouter.patch("/:id", async (req, res) => {
  const payload = knowledgeBaseInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.knowledgeBase.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "知识条目不存在" });
  }

  const item = await prisma.knowledgeBase.update({
    where: { id: existing.id },
    data: {
      title: payload.data.title,
      content: payload.data.content,
      sourceType: payload.data.source_type,
      sourceId: payload.data.source_id === undefined ? undefined : (payload.data.source_id || null),
      tags: payload.data.tags,
      category: payload.data.category,
      summary: payload.data.summary,
      keyPoints: payload.data.key_points,
      embeddings: payload.data.embeddings,
      accessCount: payload.data.access_count,
      lastAccessed: payload.data.last_accessed === undefined ? undefined : (payload.data.last_accessed ? new Date(payload.data.last_accessed) : null),
      importance: payload.data.importance,
      embeddingSummary: payload.data.embedding_summary,
      metadata: payload.data.metadata
    },
    include: { user: true }
  });

  return res.json(serializeKnowledgeBase(item));
});

knowledgeBasesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.knowledgeBase.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "知识条目不存在" });
  }

  await prisma.knowledgeBase.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
