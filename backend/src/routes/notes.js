import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { checkTextSecurityAsync } from "../services/contentSecurity.js";

export const notesRouter = Router();

const noteInputSchema = z.object({
  title: z.string().max(120).optional(),
  content: z.string().min(1),
  plain_text: z.string().optional(),
  status: z.string().optional(),
  color: z.string().optional(),
  source_type: z.string().optional(),
  ai_status: z.string().optional(),
  deleted_at: z.string().datetime().optional().nullable(),
  tags: z.any().optional(),
  metadata: z.any().optional(),
  attachments: z.any().optional()
});

notesRouter.use(requireAuth);

function toPrismaNoteStatus(status) {
  const normalized = String(status || "ACTIVE").toUpperCase();
  if (["ACTIVE", "ARCHIVED", "DELETED"].includes(normalized)) return normalized;
  return "ACTIVE";
}

function serializeNote(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    plain_text: note.plainText,
    status: note.status.toLowerCase(),
    color: note.color,
    source_type: note.sourceType,
    ai_status: note.aiStatus,
    deleted_at: note.deletedAt,
    tags: note.tags,
    metadata: note.metadata,
    attachments: note.metadata && typeof note.metadata === "object" ? note.metadata.attachments : undefined,
    share_token: note.shareToken,
    share_enabled: note.shareEnabled,
    share_expires_at: note.shareExpiresAt,
    created_date: note.createdAt,
    updated_date: note.updatedAt
  };
}

function parseSort(sort = "-updated_date") {
  const value = String(sort || "-updated_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    title: "title"
  };
  return { [mapping[key] || "updatedAt"]: order };
}

notesRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.status) where.status = toPrismaNoteStatus(req.query.status);
  if (req.query.source_type) where.sourceType = String(req.query.source_type);
  if (req.query.ai_status) where.aiStatus = String(req.query.ai_status);

  if (req.query.deleted_at !== undefined) {
    const deletedQuery = String(req.query.deleted_at).trim().toLowerCase();
    if (deletedQuery === "null" || deletedQuery === "false" || deletedQuery === "0") {
      where.deletedAt = null;
    } else if (deletedQuery === "not_null" || deletedQuery === "true" || deletedQuery === "1") {
      where.deletedAt = { not: null };
    }
  }

  const notes = await prisma.note.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(notes.map(serializeNote));
});

notesRouter.get("/:id", async (req, res) => {
  const note = await prisma.note.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!note) {
    return res.status(404).json({ error: "NOT_FOUND", message: "笔记不存在" });
  }

  return res.json(serializeNote(note));
});

// Note 模型没有独立 attachments 列，统一存 metadata.attachments；attachments 未传时原样返回 metadata
function withAttachmentsInMetadata(metadata, attachments) {
  if (attachments === undefined) return metadata;
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return { ...base, attachments };
}

notesRouter.post("/", async (req, res) => {
  const payload = noteInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const note = await prisma.note.create({
    data: {
      userId: req.user.id,
      title: payload.data.title,
      content: payload.data.content,
      plainText: payload.data.plain_text,
      status: toPrismaNoteStatus(payload.data.status),
      color: payload.data.color,
      sourceType: payload.data.source_type,
      aiStatus: payload.data.ai_status,
      deletedAt: payload.data.deleted_at ? new Date(payload.data.deleted_at) : null,
      tags: payload.data.tags,
      metadata: withAttachmentsInMetadata(payload.data.metadata, payload.data.attachments)
    }
  });

  // 内容安全：异步 msgSecCheck——先返回创建结果，命中违规时自动隐藏该心签
  checkTextSecurityAsync(
    `${payload.data.title || ""}\n${payload.data.plain_text || payload.data.content || ""}`,
    req.user.id,
    () => {
      prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } }).catch(() => {});
    }
  );

  return res.status(201).json(serializeNote(note));
});

notesRouter.patch("/:id", async (req, res) => {
  const payload = noteInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.note.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "笔记不存在" });
  }

  const note = await prisma.note.update({
    where: { id: existing.id },
    data: {
      title: payload.data.title,
      content: payload.data.content,
      plainText: payload.data.plain_text,
      status: payload.data.status ? toPrismaNoteStatus(payload.data.status) : undefined,
      color: payload.data.color,
      sourceType: payload.data.source_type,
      aiStatus: payload.data.ai_status,
      deletedAt: payload.data.deleted_at === undefined ? undefined : (payload.data.deleted_at ? new Date(payload.data.deleted_at) : null),
      tags: payload.data.tags,
      metadata: withAttachmentsInMetadata(
        payload.data.metadata !== undefined ? payload.data.metadata : existing.metadata,
        payload.data.attachments
      )
    }
  });

  return res.json(serializeNote(note));
});

notesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.note.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "笔记不存在" });
  }

  await prisma.note.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
