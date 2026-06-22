import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const relationshipsRouter = Router();

const relationshipInputSchema = z.object({
  name: z.string().min(1).max(120),
  nickname: z.string().max(120).optional().nullable(),
  relationship_type: z.string().optional(),
  closeness: z.number().int().min(1).max(10).optional(),
  interaction_count: z.number().int().min(0).optional(),
  last_interaction_date: z.string().datetime().optional().nullable(),
  favors: z.any().optional(),
  notes: z.string().max(5000).optional().nullable(),
  tags: z.any().optional(),
  preferred_contact_time: z.string().max(120).optional().nullable(),
  contact_frequency_days: z.number().int().min(1).max(3650).optional(),
  avatar_color: z.string().max(40).optional()
});

relationshipsRouter.use(requireAuth);

function serializeRelationship(item) {
  return {
    id: item.id,
    name: item.name,
    nickname: item.nickname,
    relationship_type: item.relationshipType,
    closeness: item.closeness,
    interaction_count: item.interactionCount,
    last_interaction_date: item.lastInteractionDate,
    favors: item.favors,
    notes: item.notes,
    tags: item.tags,
    preferred_contact_time: item.preferredContactTime,
    contact_frequency_days: item.contactFrequencyDays,
    avatar_color: item.avatarColor,
    created_by_id: item.userId,
    created_by: item.user?.email || null,
    created_date: item.createdAt,
    updated_date: item.updatedAt
  };
}

function buildRelationshipData(userId, payload) {
  return {
    userId,
    name: payload.name,
    nickname: payload.nickname,
    relationshipType: payload.relationship_type || "friend",
    closeness: payload.closeness ?? 5,
    interactionCount: payload.interaction_count ?? 0,
    lastInteractionDate: payload.last_interaction_date ? new Date(payload.last_interaction_date) : null,
    favors: payload.favors ?? [],
    notes: payload.notes,
    tags: payload.tags ?? [],
    preferredContactTime: payload.preferred_contact_time,
    contactFrequencyDays: payload.contact_frequency_days ?? 30,
    avatarColor: payload.avatar_color || "#384877"
  };
}

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    last_interaction_date: "lastInteractionDate",
    name: "name"
  };
  return { [mapping[key] || "createdAt"]: order };
}

relationshipsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.relationship_type) where.relationshipType = String(req.query.relationship_type);
  if (req.query.name) where.name = { contains: String(req.query.name) };
  if (req.query.created_by && String(req.query.created_by) !== req.user.email) {
    where.userId = "__none__";
  }
  if (req.query.created_by_id && String(req.query.created_by_id) !== req.user.id) {
    where.userId = "__none__";
  }

  const items = await prisma.relationship.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(items.map(serializeRelationship));
});

relationshipsRouter.get("/:id", async (req, res) => {
  const item = await prisma.relationship.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include: { user: true }
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "联系人不存在" });
  }

  return res.json(serializeRelationship(item));
});

relationshipsRouter.post("/", async (req, res) => {
  const payload = relationshipInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.relationship.create({
    data: buildRelationshipData(req.user.id, payload.data),
    include: { user: true }
  });

  return res.status(201).json(serializeRelationship(item));
});

relationshipsRouter.patch("/:id", async (req, res) => {
  const payload = relationshipInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.relationship.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "联系人不存在" });
  }

  const item = await prisma.relationship.update({
    where: { id: existing.id },
    data: {
      name: payload.data.name,
      nickname: payload.data.nickname,
      relationshipType: payload.data.relationship_type,
      closeness: payload.data.closeness,
      interactionCount: payload.data.interaction_count,
      lastInteractionDate: payload.data.last_interaction_date === undefined ? undefined : (payload.data.last_interaction_date ? new Date(payload.data.last_interaction_date) : null),
      favors: payload.data.favors,
      notes: payload.data.notes,
      tags: payload.data.tags,
      preferredContactTime: payload.data.preferred_contact_time,
      contactFrequencyDays: payload.data.contact_frequency_days,
      avatarColor: payload.data.avatar_color
    },
    include: { user: true }
  });

  return res.json(serializeRelationship(item));
});

relationshipsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.relationship.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "联系人不存在" });
  }

  await prisma.relationship.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
