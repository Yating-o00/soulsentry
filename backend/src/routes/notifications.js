import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();

const createNotificationSchema = z.object({
  recipient_id: z.string().optional(),
  type: z.string().optional(),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(5000),
  is_read: z.boolean().optional(),
  link: z.string().optional(),
  sender_id: z.string().optional(),
  related_entity_id: z.string().optional(),
  channel: z.string().optional(),
  payload: z.any().optional()
}).passthrough();

const updateNotificationSchema = createNotificationSchema.partial();

const KNOWN_NOTIFICATION_FIELDS = new Set([
  "recipient_id",
  "type",
  "title",
  "content",
  "is_read",
  "link",
  "sender_id",
  "related_entity_id",
  "channel",
  "payload"
]);

notificationsRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNotificationPayload(payload = {}) {
  const extraFields = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !KNOWN_NOTIFICATION_FIELDS.has(key) && value !== undefined)
  );

  return {
    ...(isPlainObject(payload.payload) ? payload.payload : {}),
    ...extraFields,
    type: payload.type || payload.payload?.type || "system",
    link: payload.link ?? payload.payload?.link,
    sender_id: payload.sender_id ?? payload.payload?.sender_id,
    related_entity_id: payload.related_entity_id ?? payload.payload?.related_entity_id
  };
}

function serializeNotification(notification) {
  const payload = isPlainObject(notification.payload) ? notification.payload : {};

  return {
    id: notification.id,
    recipient_id: notification.userId,
    type: payload.type || "system",
    title: notification.title,
    content: notification.body,
    is_read: notification.status === "READ",
    status: notification.status.toLowerCase(),
    channel: notification.channel,
    link: payload.link || null,
    sender_id: payload.sender_id || null,
    related_entity_id: payload.related_entity_id || null,
    ...payload,
    created_date: notification.createdAt,
    updated_date: notification.updatedAt
  };
}

notificationsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const order = String(req.query.sort || "-created_date").startsWith("-") ? "desc" : "asc";

  let notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: order },
    take: Number.isFinite(limit) ? limit : 100
  });

  if (req.query.is_read !== undefined) {
    const isRead = ["true", "1"].includes(String(req.query.is_read).toLowerCase());
    notifications = notifications.filter((item) => (item.status === "READ") === isRead);
  }

  if (req.query.type) {
    notifications = notifications.filter((item) => {
      const payloadType = isPlainObject(item.payload) ? item.payload.type : null;
      return payloadType === String(req.query.type);
    });
  }

  return res.json(notifications.map(serializeNotification));
});

notificationsRouter.post("/", async (req, res) => {
  const payload = createNotificationSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const notification = await prisma.notification.create({
    data: {
      userId: payload.data.recipient_id || req.user.id,
      title: payload.data.title,
      body: payload.data.content,
      channel: payload.data.channel || "in_app",
      status: payload.data.is_read ? "READ" : "SENT",
      payload: getNotificationPayload(payload.data)
    }
  });

  return res.status(201).json(serializeNotification(notification));
});

notificationsRouter.patch("/:id", async (req, res) => {
  const payload = updateNotificationSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.notification.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "通知不存在" });
  }

  const existingPayload = isPlainObject(existing.payload) ? existing.payload : {};
  const nextPayload = {
    ...existingPayload,
    ...getNotificationPayload({
      ...payload.data,
      payload: {
        ...existingPayload,
        ...(isPlainObject(payload.data.payload) ? payload.data.payload : {})
      }
    })
  };

  const notification = await prisma.notification.update({
    where: { id: existing.id },
    data: {
      title: payload.data.title,
      body: payload.data.content,
      channel: payload.data.channel,
      status: payload.data.is_read === undefined ? undefined : (payload.data.is_read ? "READ" : "SENT"),
      payload: nextPayload
    }
  });

  return res.json(serializeNotification(notification));
});

notificationsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.notification.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "通知不存在" });
  }

  await prisma.notification.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
