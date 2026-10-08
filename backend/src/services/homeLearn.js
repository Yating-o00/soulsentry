/**
 * 常驻点自动学习（v1）
 *
 * 设计原则（地理守护方案·四）：家、公司、健身房、父母家——从停留规律中自动识别，用户零配置；
 * 但学习结果必须可视化：「我认为你的常去地点是这些，对吗？」——理解必须可检查。
 *
 * - 记录：sentinelGeofenceTrigger 每次上报维护「开放会话」(prefs.dwell_open)，离开/超时落 DwellStay
 * - 学习：150m 贪心聚类 + 时段画像（夜间分钟→家；工作日 09-18 分钟→公司；其余高频→常去地点）
 * - 克制：已有地点 150m 内不重复建议；同一簇只问一次（按距离去重），忽略记住不再问；一次最多给 2 个
 * - 隐私：停留记录可查看(history)、可一键清空(clear_history)；服务端只存停留会话，不存原始轨迹
 */
import { prisma } from "../lib/prisma.js";
import { patchGeoPreference } from "./contextReminder.js";

const CLUSTER_RADIUS_M = 150;
const MIN_SESSION_MIN = 5;          // 少于 5 分钟的停留不记（等电梯/红灯级噪音）
const MIN_CLUSTER_SESSIONS = 3;     // 至少 3 次停留才构成候选
const MIN_CLUSTER_MIN = 30;         // 累计至少 30 分钟
const HOME_NIGHT_MIN = 120;         // 夜间(22:00-07:00 北京)停留 ≥2 小时
const OFFICE_WORKDAY_MIN = 180;     // 工作日(周一至五 09:00-18:00 北京)停留 ≥3 小时
const ANALYSIS_WINDOW_DAYS = 60;
const OPEN_SESSION_STALE_MS = 20 * 60 * 1000; // 开放会话 20 分钟无 dwell 上报即收尾

// ===== 上报接入：维护开放会话 =====

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function finalizeSession(userId, open) {
  const startedAt = new Date(open.started_at);
  const endedAt = new Date(open.last_seen_at);
  const durationMin = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
  if (durationMin < MIN_SESSION_MIN) return false;
  await prisma.dwellStay.create({
    data: {
      userId,
      latitude: open.lat,
      longitude: open.lon,
      coordType: "gcj02",
      startedAt,
      endedAt,
      durationMin,
      source: open.source || "sentinel"
    }
  });
  return true;
}

/**
 * 每次定位上报调用：dwell 延续/新开会话，移动/超时收尾。
 * 静默失败（学习是锦上添花，绝不影响主链路）。
 */
export async function recordDwellReport(userId, coords, { dwellingNow, prefsExtra }) {
  try {
    if (!coords) return;
    const now = Date.now();
    const open = prefsExtra?.dwell_open || null;
    // 字段对齐：dwell_open 存 lat/lon，距离工具用 latitude/longitude
    const openPoint = open ? { latitude: open.lat, longitude: open.lon } : null;

    if (dwellingNow) {
      if (openPoint && haversineM(coords, openPoint) <= CLUSTER_RADIUS_M) {
        await patchGeoPreference(userId, { dwell_open: { ...open, last_seen_at: now } });
      } else {
        if (open) await finalizeSession(userId, open);
        await patchGeoPreference(userId, {
          dwell_open: { lat: coords.latitude, lon: coords.longitude, started_at: now, last_seen_at: now, source: "sentinel" }
        });
      }
      return;
    }

    // 非停留：偏离会话位置或超时 → 收尾
    if (openPoint) {
      const stale = now - new Date(open.last_seen_at).getTime() > OPEN_SESSION_STALE_MS;
      if (stale || haversineM(coords, openPoint) > CLUSTER_RADIUS_M) {
        await finalizeSession(userId, open);
        await patchGeoPreference(userId, { dwell_open: null });
      }
    }
  } catch (e) {
    console.warn("[homeLearn] recordDwellReport failed:", e?.message || e);
  }
}

// ===== 时段画像（一律北京时间） =====

const BJ_OFFSET_MS = 8 * 3600 * 1000;

function bjHour(ts) {
  return new Date(ts + BJ_OFFSET_MS).getUTCHours();
}
function bjWeekday(ts) {
  // 0=周日 … 6=周六
  return new Date(ts + BJ_OFFSET_MS).getUTCDay();
}

function nightMinutes(session) {
  // 简化：会话中点落在 22:00-07:00 且时长合理 → 计入全部时长；跨段会话按 55% 折算
  const mid = (session.startedAt.getTime() + (session.endedAt?.getTime() || session.startedAt.getTime())) / 2;
  const h = bjHour(mid);
  const isNight = h >= 22 || h < 7;
  if (!isNight) return 0;
  const startH = bjHour(session.startedAt.getTime());
  const endH = bjHour(session.endedAt?.getTime() || session.startedAt.getTime());
  const crossesDay = startH >= 22 && endH < 22; // 跨夜长会话
  return Math.round(session.durationMin * (crossesDay ? 0.55 : 1));
}

function workdayMinutes(session) {
  const mid = (session.startedAt.getTime() + (session.endedAt?.getTime() || session.startedAt.getTime())) / 2;
  const day = bjWeekday(mid);
  const h = bjHour(mid);
  if (day === 0 || day === 6) return 0;
  if (h < 9 || h >= 18) return 0;
  return session.durationMin;
}

// ===== 聚类学习 =====

function clusterSessions(sessions) {
  const clusters = [];
  for (const s of sessions) {
    let hit = null;
    for (const c of clusters) {
      if (haversineM({ latitude: c.lat, longitude: c.lon }, s) <= CLUSTER_RADIUS_M) { hit = c; break; }
    }
    if (hit) {
      hit.sessions.push(s);
      // 时长加权质心
      const w = hit.sessions.reduce((acc, x) => acc + x.durationMin, 0) || 1;
      hit.lat = hit.sessions.reduce((acc, x) => acc + x.latitude * x.durationMin, 0) / w;
      hit.lon = hit.sessions.reduce((acc, x) => acc + x.longitude * x.durationMin, 0) / w;
    } else {
      clusters.push({ lat: s.latitude, lon: s.longitude, sessions: [s] });
    }
  }
  return clusters;
}

function getDecisions(prefsExtra) {
  const raw = prefsExtra?.dwell_decisions;
  return Array.isArray(raw) ? raw.filter((d) => d && typeof d === "object") : [];
}

async function saveDecisions(userId, decisions) {
  await patchGeoPreference(userId, { dwell_decisions: decisions.slice(-50) });
}

export async function analyzeDwellPatterns(userId, prefsExtra) {
  const since = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 24 * 3600 * 1000);
  const sessions = await prisma.dwellStay.findMany({
    where: { userId, startedAt: { gte: since }, durationMin: { gte: MIN_SESSION_MIN } },
    orderBy: { startedAt: "asc" }
  });
  if (sessions.length < MIN_CLUSTER_SESSIONS) return { sessions: sessions.length, candidates: [] };

  const locations = await prisma.savedLocation.findMany({ where: { userId, isActive: true } });
  const decisions = getDecisions(prefsExtra);
  const clusters = clusterSessions(sessions);
  const candidates = [];

  for (const c of clusters) {
    if (c.sessions.length < MIN_CLUSTER_SESSIONS) continue;
    const totalMin = c.sessions.reduce((acc, s) => acc + s.durationMin, 0);
    if (totalMin < MIN_CLUSTER_MIN) continue;
    // 已有地点覆盖的不重复建议
    if (locations.some((l) => haversineM(l, { latitude: c.lat, longitude: c.lon }) <= CLUSTER_RADIUS_M)) continue;
    // 同一簇只问一次（决定按距离去重）
    const decided = decisions.find((d) => haversineM({ latitude: d.lat, longitude: d.lon }, { latitude: c.lat, longitude: c.lon }) <= CLUSTER_RADIUS_M);
    if (decided) continue;

    const nightMin = c.sessions.reduce((acc, s) => acc + nightMinutes(s), 0);
    const workMin = c.sessions.reduce((acc, s) => acc + workdayMinutes(s), 0);
    const sessionCount = c.sessions.length;

    let type = null;
    let explanation = "";
    if (nightMin >= HOME_NIGHT_MIN && nightMin >= totalMin * 0.5) {
      type = "home";
      explanation = `深夜时段（22:00-07:00）在这里停留了 ${nightMin} 分钟（共 ${sessionCount} 次）——这里可能是家`;
    } else if (workMin >= OFFICE_WORKDAY_MIN && sessionCount >= 3) {
      type = "office";
      explanation = `工作日的 09:00-18:00 常在这里（${sessionCount} 次 · 共 ${workMin} 分钟）——这里可能是公司`;
    } else if (totalMin >= 60) {
      type = "frequent";
      explanation = `最近常在这里停留（${sessionCount} 次 · 共 ${totalMin} 分钟）——要记为常去地点吗？`;
    }
    if (!type) continue;

    candidates.push({
      key: `${c.lat.toFixed(3)}_${c.lon.toFixed(3)}`,
      type,
      latitude: Number(c.lat.toFixed(6)),
      longitude: Number(c.lon.toFixed(6)),
      sessions: sessionCount,
      total_min: totalMin,
      night_min: nightMin,
      workday_min: workMin,
      explanation
    });
  }

  // 家/公司优先，其次常去地点按时长
  const rank = { home: 0, office: 1, frequent: 2 };
  candidates.sort((a, b) => rank[a.type] - rank[b.type] || b.total_min - a.total_min);
  return { sessions: sessions.length, candidates: candidates.slice(0, 2) };
}

// ===== 用户动作：确认 / 忽略 =====

const TYPE_PRESET = {
  home: { name: "家", locationType: "home", radius: 180, icon: "🏠" },
  office: { name: "公司", locationType: "office", radius: 220, icon: "🏢" },
  frequent: { name: "常去地点", locationType: "other", radius: 200, icon: "📍" }
};

export async function confirmCandidate(userId, candidate) {
  const preset = TYPE_PRESET[candidate.type] || TYPE_PRESET.frequent;
  const name = candidate.type === "frequent" && candidate.custom_name
    ? String(candidate.custom_name).slice(0, 20)
    : preset.name;
  const created = await prisma.savedLocation.create({
    data: {
      userId,
      name,
      locationType: preset.locationType,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      coordType: "gcj02",
      radius: preset.radius,
      icon: preset.icon,
      isActive: true
    }
  });
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  const extra = prefs?.metadata?._extraFields && typeof prefs.metadata._extraFields === "object" ? prefs.metadata._extraFields : {};
  const decisions = getDecisions(extra);
  decisions.push({ lat: candidate.latitude, lon: candidate.longitude, type: candidate.type, status: "confirmed", decided_at: new Date().toISOString() });
  await saveDecisions(userId, decisions);
  return { location_id: created.id, name: created.name, location_type: created.locationType };
}

export async function ignoreCandidate(userId, candidate) {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  const extra = prefs?.metadata?._extraFields && typeof prefs.metadata._extraFields === "object" ? prefs.metadata._extraFields : {};
  const decisions = getDecisions(extra);
  decisions.push({ lat: candidate.latitude, lon: candidate.longitude, type: candidate.type, status: "ignored", decided_at: new Date().toISOString() });
  await saveDecisions(userId, decisions);
  return { ok: true };
}

// ===== 停留记录管理（隐私） =====

export async function listDwellHistory(userId, limit = 30) {
  const rows = await prisma.dwellStay.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(Number(limit) || 30, 1), 100)
  });
  return rows.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    coord_type: r.coordType,
    started_at: r.startedAt,
    ended_at: r.endedAt,
    duration_min: r.durationMin,
    source: r.source
  }));
}

export async function clearDwellHistory(userId) {
  const result = await prisma.dwellStay.deleteMany({ where: { userId } });
  await patchGeoPreference(userId, { dwell_open: null });
  return { deleted: result.count };
}
