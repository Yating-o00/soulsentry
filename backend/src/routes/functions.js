import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { invokeKimiText, invokeKimiWebSearch } from "../lib/kimi.js";
import { env } from "../config/env.js";
import { analyzeIntentWithKimi } from "../services/analyzeIntent.js";

export const functionsRouter = Router();

functionsRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPreferenceExtraFields(preferences) {
  if (preferences?.metadata && isPlainObject(preferences.metadata)) {
    const extraFields = preferences.metadata._extraFields;
    if (isPlainObject(extraFields)) {
      return extraFields;
    }
  }
  return {};
}

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2
    + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getTaskExtraFields(task) {
  if (isPlainObject(task?.metadata?._extraFields)) {
    return task.metadata._extraFields;
  }
  return {};
}

function getTaskLocationReminder(task) {
  const extraFields = getTaskExtraFields(task);
  const reminder = extraFields.location_reminder;
  return isPlainObject(reminder) ? reminder : null;
}

function getGeofencePreset(locationType) {
  const presets = {
    home: { radius: 180, quiet_minutes: 45 },
    office: { radius: 220, quiet_minutes: 30 },
    gym: { radius: 120, quiet_minutes: 60 },
    school: { radius: 180, quiet_minutes: 45 },
    shopping: { radius: 150, quiet_minutes: 30 },
    hospital: { radius: 220, quiet_minutes: 90 },
    restaurant: { radius: 120, quiet_minutes: 20 },
    other: { radius: 200, quiet_minutes: 30 }
  };
  return presets[String(locationType || "other")] || presets.other;
}

functionsRouter.post("/:name", async (req, res) => {
  const { name } = req.params;
  const payload = req.body || {};

  try {
    if (name === "invokeKimi") {
      if (Array.isArray(payload.file_urls) && payload.file_urls.length > 0) {
        return res.status(501).json({
          error: "FILE_INPUT_NOT_IMPLEMENTED",
          message: "独立后端当前仅支持纯文本 Kimi 调用，文件上传与附件抽取尚未迁移"
        });
      }

      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json(data);
    }

    if (name === "kimiWebBrowse") {
      const data = await invokeKimiWebSearch({
        query: payload.query,
        language: payload.language
      });

      return res.json(data);
    }

    if (name === "analyzeIntent") {
      const data = await analyzeIntentWithKimi({
        input: payload.input,
        date: payload.date,
        existingPlan: payload.existingPlan
      });

      return res.json(data);
    }

    if (name === "callAI") {
      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json({
        data,
        balance: req.user.aiCredits
      });
    }

    if (name === "getVapidPublicKey") {
      return res.json({
        publicKey: env.VAPID_PUBLIC_KEY || null
      });
    }

    if (name === "savePushSubscription") {
      const existingPreferences = await prisma.userPreference.findUnique({
        where: { userId: req.user.id }
      });

      const previousExtraFields = getPreferenceExtraFields(existingPreferences);
      const nextExtraFields = {
        ...previousExtraFields,
        push_subscription: payload.subscription || null,
        push_user_agent: payload.user_agent || previousExtraFields.push_user_agent || null,
        push_enabled: Boolean(payload.subscription)
      };

      const nextMetadata = {
        ...(isPlainObject(existingPreferences?.metadata) ? existingPreferences.metadata : {}),
        _extraFields: nextExtraFields
      };

      const preference = await prisma.userPreference.upsert({
        where: { userId: req.user.id },
        update: {
          pushNotifications: payload.subscription ? true : false,
          metadata: nextMetadata
        },
        create: {
          userId: req.user.id,
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          pushNotifications: payload.subscription ? true : false,
          metadata: nextMetadata
        }
      });

      return res.json({
        ok: true,
        subscribed: Boolean(payload.subscription),
        preference_id: preference.id
      });
    }

    if (name === "suggestGeofenceParams") {
      const preset = getGeofencePreset(payload.location_type);
      return res.json({
        radius: payload.radius || preset.radius,
        quiet_minutes: payload.quiet_minutes || preset.quiet_minutes,
        latitude: typeof payload.latitude === "number" ? payload.latitude : undefined,
        longitude: typeof payload.longitude === "number" ? payload.longitude : undefined,
        resolved_address: payload.address || payload.name || "",
        source: "standalone-heuristic"
      });
    }

    if (name === "geofenceTrigger") {
      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const reminders = tasks
        .map((task) => {
          const locationReminder = getTaskLocationReminder(task);
          if (!locationReminder?.enabled) return null;
          if (typeof locationReminder.latitude !== "number" || typeof locationReminder.longitude !== "number") return null;

          const distance = haversineMeters(
            { latitude: payload.latitude, longitude: payload.longitude },
            { latitude: locationReminder.latitude, longitude: locationReminder.longitude }
          );

          const radius = Number(locationReminder.radius || 200);
          if (distance > radius) return null;

          return {
            task_id: task.id,
            title: task.title,
            distance: Math.round(distance),
            location_name: locationReminder.location_name || "目标地点",
            trigger_on: locationReminder.trigger_on || "enter"
          };
        })
        .filter(Boolean);

      return res.json({ reminders });
    }

    if (name === "nearbyTaskMatcher") {
      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const matches = tasks
        .map((task) => {
          const locationReminder = getTaskLocationReminder(task);
          if (!locationReminder?.enabled) return null;
          if (typeof locationReminder.latitude !== "number" || typeof locationReminder.longitude !== "number") return null;

          const distance = haversineMeters(
            { latitude: payload.latitude, longitude: payload.longitude },
            { latitude: locationReminder.latitude, longitude: locationReminder.longitude }
          );

          const radius = Number(locationReminder.radius || 200);
          if (distance > Math.max(radius, 400)) return null;

          return {
            task_id: task.id,
            title: task.title,
            distance: Math.round(distance),
            location_name: locationReminder.location_name || "附近地点",
            priority: task.priority
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

      return res.json({
        matched: matches.length > 0,
        matches,
        card: matches[0] || null
      });
    }

    if (name === "sentinelGeofenceTrigger") {
      const locations = await prisma.savedLocation.findMany({
        where: {
          userId: req.user.id,
          isActive: true
        }
      });

      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const results = [];

      for (const location of locations) {
        const distance = haversineMeters(
          { latitude: payload.latitude, longitude: payload.longitude },
          { latitude: location.latitude, longitude: location.longitude }
        );

        if (distance > location.radius) continue;

        const linkedTask = tasks.find((task) => {
          const locationReminder = getTaskLocationReminder(task);
          return locationReminder?.enabled && locationReminder.location_name === location.name;
        });

        if (!linkedTask) continue;

        results.push({
          event: "enter",
          level: "standard",
          location_name: location.name,
          task_id: linkedTask.id,
          task_title: linkedTask.title,
          context_summary: `${linkedTask.title} 已进入 ${location.name} 附近可提醒范围`,
          distance: Math.round(distance)
        });
      }

      return res.json({ results });
    }

    if (["executeAutomation", "createStripeCheckout", "queryWechatOrder"].includes(name)) {
      return res.status(501).json({
        error: "FUNCTION_NOT_IMPLEMENTED",
        message: `独立后端已预留 ${name}，但尚未完成迁移`,
        input: payload
      });
    }

    return res.status(404).json({
      error: "FUNCTION_NOT_FOUND",
      message: `未找到函数 ${name}`
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "FUNCTION_EXECUTION_FAILED",
      message: error.message || "函数执行失败"
    });
  }
});
