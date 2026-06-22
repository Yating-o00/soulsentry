import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const savedLocationsRouter = Router();

const savedLocationInputSchema = z.object({
  name: z.string().min(1).max(120),
  location_type: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  radius: z.number().int().min(1).max(100000).optional(),
  address: z.string().optional(),
  icon: z.string().optional(),
  is_active: z.boolean().optional(),
  trigger_on: z.string().optional(),
  last_entered_at: z.string().datetime().optional().nullable(),
  last_exited_at: z.string().datetime().optional().nullable(),
  quiet_minutes: z.number().int().min(0).max(10080).optional(),
  quiet_policy: z.any().optional(),
  notification_stats: z.any().optional()
});

const savedLocationBatchSchema = z.array(savedLocationInputSchema).min(1).max(100);

savedLocationsRouter.use(requireAuth);

function serializeSavedLocation(location) {
  return {
    id: location.id,
    name: location.name,
    location_type: location.locationType,
    latitude: location.latitude,
    longitude: location.longitude,
    radius: location.radius,
    address: location.address,
    icon: location.icon,
    is_active: location.isActive,
    trigger_on: location.triggerOn,
    last_entered_at: location.lastEnteredAt,
    last_exited_at: location.lastExitedAt,
    quiet_minutes: location.quietMinutes,
    quiet_policy: location.quietPolicy,
    notification_stats: location.notificationStats,
    created_by_id: location.userId,
    created_by: location.user?.email || null,
    created_date: location.createdAt,
    updated_date: location.updatedAt
  };
}

function buildSavedLocationData(userId, payload) {
  return {
    userId,
    name: payload.name,
    locationType: payload.location_type || "other",
    latitude: payload.latitude,
    longitude: payload.longitude,
    radius: payload.radius ?? 200,
    address: payload.address,
    icon: payload.icon || "📍",
    isActive: payload.is_active ?? true,
    triggerOn: payload.trigger_on || "enter",
    lastEnteredAt: payload.last_entered_at ? new Date(payload.last_entered_at) : null,
    lastExitedAt: payload.last_exited_at ? new Date(payload.last_exited_at) : null,
    quietMinutes: payload.quiet_minutes ?? 30,
    quietPolicy: payload.quiet_policy,
    notificationStats: payload.notification_stats
  };
}

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    name: "name"
  };
  return { [mapping[key] || "createdAt"]: order };
}

savedLocationsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.location_type) where.locationType = String(req.query.location_type);
  if (req.query.is_active !== undefined) {
    where.isActive = ["true", "1"].includes(String(req.query.is_active).toLowerCase());
  }
  if (req.query.created_by && String(req.query.created_by) !== req.user.email) {
    where.userId = "__none__";
  }
  if (req.query.created_by_id && String(req.query.created_by_id) !== req.user.id) {
    where.userId = "__none__";
  }

  const locations = await prisma.savedLocation.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(locations.map(serializeSavedLocation));
});

savedLocationsRouter.get("/:id", async (req, res) => {
  const location = await prisma.savedLocation.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    },
    include: { user: true }
  });

  if (!location) {
    return res.status(404).json({ error: "NOT_FOUND", message: "地点不存在" });
  }

  return res.json(serializeSavedLocation(location));
});

savedLocationsRouter.post("/", async (req, res) => {
  const payload = savedLocationInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const location = await prisma.savedLocation.create({
    data: buildSavedLocationData(req.user.id, payload.data),
    include: { user: true }
  });

  return res.status(201).json(serializeSavedLocation(location));
});

savedLocationsRouter.post("/batch", async (req, res) => {
  const payload = savedLocationBatchSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const locations = await prisma.$transaction(
    payload.data.map((item) =>
      prisma.savedLocation.create({
        data: buildSavedLocationData(req.user.id, item),
        include: { user: true }
      })
    )
  );

  return res.status(201).json(locations.map(serializeSavedLocation));
});

savedLocationsRouter.patch("/:id", async (req, res) => {
  const payload = savedLocationInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.savedLocation.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "地点不存在" });
  }

  const location = await prisma.savedLocation.update({
    where: { id: existing.id },
    data: {
      name: payload.data.name,
      locationType: payload.data.location_type,
      latitude: payload.data.latitude,
      longitude: payload.data.longitude,
      radius: payload.data.radius,
      address: payload.data.address,
      icon: payload.data.icon,
      isActive: payload.data.is_active,
      triggerOn: payload.data.trigger_on,
      lastEnteredAt: payload.data.last_entered_at === undefined ? undefined : (payload.data.last_entered_at ? new Date(payload.data.last_entered_at) : null),
      lastExitedAt: payload.data.last_exited_at === undefined ? undefined : (payload.data.last_exited_at ? new Date(payload.data.last_exited_at) : null),
      quietMinutes: payload.data.quiet_minutes,
      quietPolicy: payload.data.quiet_policy,
      notificationStats: payload.data.notification_stats
    },
    include: { user: true }
  });

  return res.json(serializeSavedLocation(location));
});

savedLocationsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.savedLocation.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "地点不存在" });
  }

  await prisma.savedLocation.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
