import { base44 } from "@/api/base44Client";

/**
 * 获取当前环境上下文：浏览器定位 + 匹配 SavedLocation + 用户作息
 * 返回结构供 AI 推断"最佳提醒时机"使用。
 *
 * 失败时不抛错，返回带 unknown 标记的对象，让 AI 自己决定追问。
 */

const EARTH_RADIUS_M = 6371000;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function getBrowserPosition(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

export async function getCurrentLocationContext() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun

  const ctx = {
    current_time: now.toISOString(),
    day_of_week: dayOfWeek,
    is_workday: dayOfWeek >= 1 && dayOfWeek <= 5,
    current_place_type: "unknown",
    current_place_name: null,
    daily_routine: null,
  };

  // 1. 取用户作息偏好
  try {
    const prefs = await base44.entities.UserPreference.list();
    const pref = prefs?.[0];
    if (pref?.daily_routine) {
      ctx.daily_routine = pref.daily_routine;
      if (Array.isArray(pref.daily_routine.work_days)) {
        ctx.is_workday = pref.daily_routine.work_days.includes(dayOfWeek);
      }
    }
  } catch (e) {
    // 静默
  }

  // 2. 取当前位置 + 匹配 SavedLocation（只匹配当前用户 active 的地点）
  const pos = await getBrowserPosition();
  if (!pos) return ctx;
  ctx.coords = { latitude: pos.latitude, longitude: pos.longitude };

  try {
    let me = null;
    try { me = await base44.auth.me(); } catch { /* 未登录则取全部，RLS 兜底 */ }
    const query = me?.email ? { created_by: me.email, is_active: true } : { is_active: true };
    const saved = await base44.entities.SavedLocation.filter(query);
    let best = null;
    let bestDist = Infinity;
    for (const loc of saved || []) {
      if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") continue;
      const d = haversineMeters(pos.latitude, pos.longitude, loc.latitude, loc.longitude);
      const radius = loc.radius || 200;
      if (d <= radius && d < bestDist) {
        best = loc;
        bestDist = d;
      }
    }
    if (best) {
      ctx.current_place_type = best.location_type || "other";
      ctx.current_place_name = best.name;
      ctx.current_place_id = best.id;
    } else {
      ctx.current_place_type = "other";
    }
  } catch (e) {
    // 静默
  }

  return ctx;
}