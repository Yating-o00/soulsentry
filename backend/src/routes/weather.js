import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getWeatherForCoords,
  buildWeatherNotice,
  buildWeatherAdviceForTask
} from "../services/weatherService.js";

export const weatherRouter = Router();

weatherRouter.use(requireAuth);

// 中国时区（UTC+8，无夏令时）下的今天起止
function chinaTodayRange() {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  const ymd = cn.toISOString().slice(0, 10);
  const start = new Date(`${ymd}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

function getLastLocation(preferences) {
  const loc = preferences?.metadata?.last_location;
  if (!loc || typeof loc !== "object") return null;
  const lat = Number(loc.latitude);
  const lon = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { latitude: lat, longitude: lon, updated_at: loc.updated_at || null };
}

// 记录用户最近位置（供提醒场景反查天气），1 小时内不重复写
async function persistLastLocation(userId, preferences, latitude, longitude) {
  try {
    const prev = getLastLocation(preferences);
    if (prev?.updated_at) {
      const age = Date.now() - new Date(prev.updated_at).getTime();
      const moved = Math.abs(prev.latitude - latitude) > 0.01 || Math.abs(prev.longitude - longitude) > 0.01;
      if (age < 60 * 60 * 1000 && !moved) return;
    }
    const metadata = {
      ...(preferences?.metadata && typeof preferences.metadata === "object" ? preferences.metadata : {}),
      last_location: { latitude, longitude, updated_at: new Date().toISOString() }
    };
    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, metadata },
      update: { metadata }
    });
  } catch (err) {
    console.warn("[weather] persist last_location failed:", err?.message || err);
  }
}

/**
 * GET /api/weather?lat=&lon=
 * 看板天气小标注 + 通用提示 + 今日到期户外约定的天气建议。
 * 坐标优先级：请求参数 > 用户最近位置 > 环境默认城市。
 */
weatherRouter.get("/", async (req, res) => {
  const userId = req.user?.id;
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  const preferences = await prisma.userPreference.findUnique({ where: { userId } });

  let coords = null;
  if (hasCoords) {
    coords = { latitude: lat, longitude: lon };
    await persistLastLocation(userId, preferences, lat, lon);
  } else {
    const last = getLastLocation(preferences);
    if (last) {
      coords = { latitude: last.latitude, longitude: last.longitude };
    } else if (Number.isFinite(env.WEATHER_DEFAULT_LAT) && Number.isFinite(env.WEATHER_DEFAULT_LON)) {
      coords = { latitude: env.WEATHER_DEFAULT_LAT, longitude: env.WEATHER_DEFAULT_LON };
    }
  }

  if (!coords) {
    return res.json({ ok: false, reason: "no_location" });
  }

  const weather = await getWeatherForCoords(coords.latitude, coords.longitude);
  if (!weather) {
    return res.json({ ok: false, reason: "weather_unavailable" });
  }

  // 今日到期的活跃约定 → 户外类给出天气建议（最多 3 条）
  let taskAdvice = [];
  try {
    const { start, end } = chinaTodayRange();
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { notIn: ["DONE", "ARCHIVED"] },
        OR: [
          { dueAt: { gte: start, lt: end } },
          { dueAt: null, reminderTime: { gte: start, lt: end } }
        ]
      },
      select: { id: true, title: true, description: true },
      take: 50
    });
    taskAdvice = tasks
      .map((t) => ({ task_id: t.id, title: t.title, advice: buildWeatherAdviceForTask(weather, t) }))
      .filter((t) => t.advice)
      .slice(0, 3);
  } catch (err) {
    console.warn("[weather] task advice failed:", err?.message || err);
  }

  return res.json({
    ok: true,
    current: {
      temp: weather.temp,
      code: weather.code,
      text: weather.text,
      icon: weather.icon,
      is_raining: weather.is_raining,
      is_snowing: weather.is_snowing
    },
    today: weather.today,
    notice: buildWeatherNotice(weather),
    task_advice: taskAdvice
  });
});
