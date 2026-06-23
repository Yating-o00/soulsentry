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

function decodeXmlEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value = "") {
  return decodeXmlEntities(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function pickXmlValue(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const matched = String(block || "").match(regex);
  return matched ? decodeXmlEntities(matched[1]).trim() : "";
}

function pickXmlLink(block) {
  const attributeMatch = String(block || "").match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (attributeMatch?.[1]) {
    return decodeXmlEntities(attributeMatch[1]).trim();
  }
  return stripHtml(pickXmlValue(block, "link"));
}

function parseRssItems(xmlText = "") {
  const blocks = String(xmlText).match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map((block) => {
    const title = stripHtml(pickXmlValue(block, "title"));
    const link = pickXmlLink(block);
    const description = stripHtml(
      pickXmlValue(block, "description")
      || pickXmlValue(block, "summary")
      || pickXmlValue(block, "content")
      || pickXmlValue(block, "content:encoded")
    );
    const pubDate = stripHtml(
      pickXmlValue(block, "pubDate")
      || pickXmlValue(block, "published")
      || pickXmlValue(block, "updated")
    );
    return {
      title,
      link,
      summary: description.slice(0, 280),
      published_at: pubDate || null
    };
  }).filter((item) => item.title && item.link);
}

function buildExternalVisionCards(feed, items = []) {
  return items.slice(0, 3).map((item, index) => ({
    id: `${feed.id}:${index}:${item.link}`,
    type: feed.feedType === "rss" ? "subscription" : "expansion",
    title: item.title,
    summary: item.summary || `${feed.name} 的最新更新`,
    source: feed.name,
    url: item.link,
    relevance: feed.description || "",
    published_at: item.published_at || null
  }));
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

    if (name === "getSentinelGuard") {
      return res.json({
        success: true,
        geo_context: null,
        forgetting_rescue: null,
        generated_at: new Date().toISOString()
      });
    }

    if (name === "getAssociationRecommendations") {
      return res.json({
        success: true,
        sequential_recommendation: null,
        location_pattern: null,
        rules_count: 0,
        generated_at: new Date().toISOString()
      });
    }

    if (name === "fetchExternalFeeds") {
      const feed = await prisma.externalFeed.findFirst({
        where: {
          id: payload.feed_id,
          userId: req.user.id
        }
      });

      if (!feed) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: "外部信息源不存在"
        });
      }

      if (!feed.url) {
        return res.status(400).json({
          error: "INVALID_FEED",
          message: "该信息源缺少 URL"
        });
      }

      const response = await fetch(feed.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 SoulSentry/1.0"
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        return res.status(502).json({
          error: "FETCH_FAILED",
          message: `拉取失败：${response.status}`
        });
      }

      const xmlText = await response.text();
      const items = parseRssItems(xmlText);
      const now = new Date();

      let archived = 0;
      if (feed.autoArchiveToHeartsign) {
        for (const item of items.slice(0, 10)) {
          const duplicate = await prisma.note.findFirst({
            where: {
              userId: req.user.id,
              sourceType: "external_feed",
              plainText: `${item.title} ${item.summary}`.slice(0, 1000)
            }
          });

          if (duplicate) continue;

          await prisma.note.create({
            data: {
              userId: req.user.id,
              title: item.title.slice(0, 200),
              content: `**${item.title}**\n\n${item.summary}\n\n来源：${feed.name}\n链接：${item.link}`,
              plainText: `${item.title} ${item.summary}`.slice(0, 1000),
              sourceType: "external_feed",
              aiStatus: "pending",
              tags: ["外部信息", feed.name]
            }
          });
          archived += 1;
        }
      }

      await prisma.externalFeed.update({
        where: { id: feed.id },
        data: {
          lastFetchedAt: now,
          lastItemCount: items.length,
          metadata: {
            ...(isPlainObject(feed.metadata) ? feed.metadata : {}),
            latest_items: items.slice(0, 10)
          }
        }
      });

      return res.json({
        fetched: items.length,
        archived,
        feed_id: feed.id
      });
    }

    if (name === "getExternalVision") {
      const feeds = await prisma.externalFeed.findMany({
        where: {
          userId: req.user.id,
          isActive: true
        },
        orderBy: [
          { lastFetchedAt: "desc" },
          { createdAt: "desc" }
        ],
        take: 6
      });

      const cards = [];

      for (const feed of feeds) {
        const latestItems = Array.isArray(feed.metadata?.latest_items) ? feed.metadata.latest_items : [];

        if (latestItems.length > 0) {
          cards.push(...buildExternalVisionCards(feed, latestItems));
          continue;
        }

        cards.push({
          id: feed.id,
          type: feed.feedType === "rss" ? "subscription" : "expansion",
          title: feed.name,
          summary: feed.description || "已接入外部信息源，等待首次拉取内容。",
          source: feed.name,
          url: feed.url || "",
          relevance: "可在“外部信息接入”中手动拉取最新内容"
        });
      }

      return res.json({
        cards: cards.slice(0, 12)
      });
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
