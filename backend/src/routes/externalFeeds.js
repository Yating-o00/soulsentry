import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const externalFeedsRouter = Router();

const externalFeedInputSchema = z.object({
  name: z.string().min(1).max(200),
  feed_type: z.string().optional(),
  url: z.string().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  icon: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
  fetch_frequency_hours: z.number().int().min(1).max(720).optional(),
  last_fetched_at: z.string().datetime().optional().nullable(),
  last_item_count: z.number().int().min(0).optional(),
  auto_archive_to_heartsign: z.boolean().optional(),
  metadata: z.any().optional()
});

externalFeedsRouter.use(requireAuth);

function serializeExternalFeed(item) {
  return {
    id: item.id,
    name: item.name,
    feed_type: item.feedType,
    url: item.url,
    description: item.description,
    icon: item.icon,
    is_active: item.isActive,
    fetch_frequency_hours: item.fetchFrequencyHours,
    last_fetched_at: item.lastFetchedAt,
    last_item_count: item.lastItemCount,
    auto_archive_to_heartsign: item.autoArchiveToHeartsign,
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
    last_fetched_at: "lastFetchedAt",
    name: "name"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function buildExternalFeedData(userId, payload) {
  return {
    userId,
    name: payload.name,
    feedType: payload.feed_type || "rss",
    url: payload.url || null,
    description: payload.description || null,
    icon: payload.icon || "📡",
    isActive: payload.is_active ?? true,
    fetchFrequencyHours: payload.fetch_frequency_hours ?? 24,
    lastFetchedAt: payload.last_fetched_at ? new Date(payload.last_fetched_at) : null,
    lastItemCount: payload.last_item_count ?? 0,
    autoArchiveToHeartsign: payload.auto_archive_to_heartsign ?? true,
    metadata: payload.metadata
  };
}

externalFeedsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.feed_type) where.feedType = String(req.query.feed_type);
  if (req.query.is_active !== undefined) {
    where.isActive = ["true", "1"].includes(String(req.query.is_active).toLowerCase());
  }

  const items = await prisma.externalFeed.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(items.map(serializeExternalFeed));
});

externalFeedsRouter.get("/:id", async (req, res) => {
  const item = await prisma.externalFeed.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include: { user: true }
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "外部信息源不存在" });
  }

  return res.json(serializeExternalFeed(item));
});

externalFeedsRouter.post("/", async (req, res) => {
  const payload = externalFeedInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.externalFeed.create({
    data: buildExternalFeedData(req.user.id, payload.data),
    include: { user: true }
  });

  return res.status(201).json(serializeExternalFeed(item));
});

externalFeedsRouter.patch("/:id", async (req, res) => {
  const payload = externalFeedInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.externalFeed.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "外部信息源不存在" });
  }

  const item = await prisma.externalFeed.update({
    where: { id: existing.id },
    data: {
      name: payload.data.name,
      feedType: payload.data.feed_type,
      url: payload.data.url === undefined ? undefined : (payload.data.url || null),
      description: payload.data.description === undefined ? undefined : (payload.data.description || null),
      icon: payload.data.icon,
      isActive: payload.data.is_active,
      fetchFrequencyHours: payload.data.fetch_frequency_hours,
      lastFetchedAt: payload.data.last_fetched_at === undefined ? undefined : (payload.data.last_fetched_at ? new Date(payload.data.last_fetched_at) : null),
      lastItemCount: payload.data.last_item_count,
      autoArchiveToHeartsign: payload.data.auto_archive_to_heartsign,
      metadata: payload.data.metadata
    },
    include: { user: true }
  });

  return res.json(serializeExternalFeed(item));
});

externalFeedsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.externalFeed.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "外部信息源不存在" });
  }

  await prisma.externalFeed.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
