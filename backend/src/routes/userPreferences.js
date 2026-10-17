import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const userPreferencesRouter = Router();

const preferenceInputSchema = z.object({
  quiet_hours_start: z.string().optional().nullable(),
  quiet_hours_end: z.string().optional().nullable(),
  email_notifications: z.boolean().optional(),
  push_notifications: z.boolean().optional(),
  location_reminders: z.boolean().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  metadata: z.any().optional()
}).passthrough();

const KNOWN_PREFERENCE_FIELDS = new Set([
  "quiet_hours_start",
  "quiet_hours_end",
  "email_notifications",
  "push_notifications",
  "location_reminders",
  "locale",
  "timezone",
  "metadata"
]);

userPreferencesRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPreferenceExtraFields(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !KNOWN_PREFERENCE_FIELDS.has(key) && value !== undefined)
  );
}

function mergePreferenceMetadata(existingMetadata, nextMetadata, extraFields = {}) {
  const baseMetadata = nextMetadata === undefined ? existingMetadata : nextMetadata;
  const normalized = isPlainObject(baseMetadata)
    ? { ...baseMetadata }
    : baseMetadata === undefined || baseMetadata === null
      ? {}
      : { _value: baseMetadata };

  const previousExtraFields = isPlainObject(normalized._extraFields)
    ? normalized._extraFields
    : {};

  normalized._extraFields = {
    ...previousExtraFields,
    ...extraFields
  };

  return normalized;
}

function serializeUserPreference(preference) {
  const extraFields = isPlainObject(preference?.metadata?._extraFields)
    ? preference.metadata._extraFields
    : {};

  return {
    id: preference.id,
    user_id: preference.userId,
    quiet_hours_start: preference.quietHoursStart,
    quiet_hours_end: preference.quietHoursEnd,
    email_notifications: preference.emailNotifications,
    push_notifications: preference.pushNotifications,
    location_reminders: preference.locationReminders,
    locale: preference.locale,
    timezone: preference.timezone,
    ...extraFields,
    metadata: preference.metadata,
    created_date: preference.createdAt,
    updated_date: preference.updatedAt
  };
}

function buildPreferenceData(userId, payload, existingMetadata) {
  const extraFields = getPreferenceExtraFields(payload);

  return {
    userId,
    quietHoursStart: payload.quiet_hours_start,
    quietHoursEnd: payload.quiet_hours_end,
    emailNotifications: payload.email_notifications,
    pushNotifications: payload.push_notifications,
    locationReminders: payload.location_reminders,
    locale: payload.locale,
    timezone: payload.timezone,
    metadata: mergePreferenceMetadata(existingMetadata, payload.metadata, extraFields)
  };
}

userPreferencesRouter.get("/", async (req, res) => {
  const preference = await prisma.userPreference.findUnique({
    where: { userId: req.user.id }
  });

  return res.json(preference ? [serializeUserPreference(preference)] : []);
});

userPreferencesRouter.get("/:id", async (req, res) => {
  const preference = await prisma.userPreference.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!preference) {
    return res.status(404).json({ error: "NOT_FOUND", message: "用户偏好不存在" });
  }

  return res.json(serializeUserPreference(preference));
});

userPreferencesRouter.post("/", async (req, res) => {
  const payload = preferenceInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.userPreference.findUnique({
    where: { userId: req.user.id }
  });

  const preference = existing
    ? await prisma.userPreference.update({
        where: { id: existing.id },
        data: buildPreferenceData(req.user.id, payload.data, existing.metadata)
      })
    : await prisma.userPreference.create({
        data: {
          ...buildPreferenceData(req.user.id, payload.data, undefined),
          locale: payload.data.locale || "zh-CN",
          timezone: payload.data.timezone || "Asia/Shanghai"
        }
      });

  return res.status(201).json(serializeUserPreference(preference));
});

userPreferencesRouter.patch("/:id", async (req, res) => {
  const payload = preferenceInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.userPreference.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "用户偏好不存在" });
  }

  const preference = await prisma.userPreference.update({
    where: { id: existing.id },
    data: buildPreferenceData(req.user.id, payload.data, existing.metadata)
  });

  return res.json(serializeUserPreference(preference));
});
