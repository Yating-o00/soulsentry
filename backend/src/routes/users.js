import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = Router();

const updateMeSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  subscription_plan: z.string().min(1).optional(),
  ai_credits: z.number().int().min(0).optional(),
  theme_preferences: z.record(z.any()).optional(),
  dnd_settings: z.object({
    enabled: z.boolean().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional()
  }).optional()
});

function getPreferenceExtraFields(preferences) {
  if (preferences?.metadata && typeof preferences.metadata === "object" && !Array.isArray(preferences.metadata)) {
    const extraFields = preferences.metadata._extraFields;
    if (extraFields && typeof extraFields === "object" && !Array.isArray(extraFields)) {
      return extraFields;
    }
  }
  return {};
}

function getDndSettings(preferences) {
  const extraFields = getPreferenceExtraFields(preferences);
  const storedDnd = extraFields.dnd_settings && typeof extraFields.dnd_settings === "object"
    ? extraFields.dnd_settings
    : {};

  return {
    enabled: Boolean(storedDnd.enabled),
    start_time: storedDnd.start_time || preferences?.quietHoursStart || "22:00",
    end_time: storedDnd.end_time || preferences?.quietHoursEnd || "08:00"
  };
}

function serializePreference(preferences) {
  if (!preferences) return null;

  return {
    id: preferences.id,
    quiet_hours_start: preferences.quietHoursStart,
    quiet_hours_end: preferences.quietHoursEnd,
    email_notifications: preferences.emailNotifications,
    push_notifications: preferences.pushNotifications,
    location_reminders: preferences.locationReminders,
    locale: preferences.locale,
    timezone: preferences.timezone,
    ...getPreferenceExtraFields(preferences),
    created_date: preferences.createdAt,
    updated_date: preferences.updatedAt
  };
}

usersRouter.use(requireAuth);

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" }
  });

  return res.json(users.map((user) => ({
    id: user.id,
    email: user.email,
    full_name: user.displayName || user.email,
    display_name: user.displayName,
    role: user.role.toLowerCase(),
    subscription_plan: user.subscriptionPlan,
    ai_credits: user.aiCredits,
    theme_preferences: user.themePreferences,
    created_date: user.createdAt,
    updated_date: user.updatedAt
  })));
});

usersRouter.get("/me", async (req, res) => {
  return res.json({
    id: req.user.id,
    email: req.user.email,
    full_name: req.user.displayName || req.user.email,
    display_name: req.user.displayName,
    role: req.user.role.toLowerCase(),
    subscription_plan: req.user.subscriptionPlan,
    ai_credits: req.user.aiCredits,
    theme_preferences: req.user.themePreferences,
    dnd_settings: getDndSettings(req.user.preferences),
    preferences: serializePreference(req.user.preferences)
  });
});

usersRouter.patch("/me", async (req, res) => {
  const payload = updateMeSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const nextUser = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: req.user.id },
      data: {
        displayName: payload.data.display_name,
        subscriptionPlan: payload.data.subscription_plan,
        aiCredits: payload.data.ai_credits,
        themePreferences: payload.data.theme_preferences
      }
    });

    if (payload.data.dnd_settings) {
      const existingPreferences = await tx.userPreference.findUnique({
        where: { userId: req.user.id }
      });

      const previousExtraFields = getPreferenceExtraFields(existingPreferences);
      const nextDndSettings = {
        ...getDndSettings(existingPreferences),
        ...payload.data.dnd_settings
      };

      const nextMetadata = {
        ...(existingPreferences?.metadata && typeof existingPreferences.metadata === "object" && !Array.isArray(existingPreferences.metadata)
          ? existingPreferences.metadata
          : {}),
        _extraFields: {
          ...previousExtraFields,
          dnd_settings: nextDndSettings
        }
      };

      await tx.userPreference.upsert({
        where: { userId: req.user.id },
        update: {
          quietHoursStart: nextDndSettings.start_time || null,
          quietHoursEnd: nextDndSettings.end_time || null,
          metadata: nextMetadata
        },
        create: {
          userId: req.user.id,
          quietHoursStart: nextDndSettings.start_time || null,
          quietHoursEnd: nextDndSettings.end_time || null,
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          metadata: nextMetadata
        }
      });
    }

    return tx.user.findUnique({
      where: { id: req.user.id },
      include: { preferences: true }
    });
  });

  return res.json({
    id: nextUser.id,
    email: nextUser.email,
    full_name: nextUser.displayName || nextUser.email,
    display_name: nextUser.displayName,
    role: nextUser.role.toLowerCase(),
    subscription_plan: nextUser.subscriptionPlan,
    ai_credits: nextUser.aiCredits,
    theme_preferences: nextUser.themePreferences,
    dnd_settings: getDndSettings(nextUser.preferences),
    preferences: serializePreference(nextUser.preferences)
  });
});
