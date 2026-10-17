// 地理工具：坐标系归一化 + 距离/方向判定
// 背景：web 端 Leaflet/OpenStreetMap 使用 WGS-84 坐标，微信小程序使用 GCJ-02（国测局加密坐标），
// 两者在中国境内偏差 300~700m，对 200m 级地理围栏判定是致命的。统一归一化为 GCJ-02 后再做判定。

const PI = Math.PI;
const AXIS = 6378245.0;           // 长半轴
const EE = 0.00669342162296594323; // 扁率平方

function outOfChina(latitude, longitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02（中国境内生效，境外原样返回） */
export function wgs84ToGcj02(latitude, longitude) {
  if (outOfChina(latitude, longitude)) return { latitude, longitude };
  let dLat = transformLat(longitude - 105.0, latitude - 35.0);
  let dLon = transformLon(longitude - 105.0, latitude - 35.0);
  const radLat = (latitude / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((AXIS * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return { latitude: latitude + dLat, longitude: longitude + dLon };
}

/** 将任意来源坐标归一化为 GCJ-02。coordType: "gcj02" | "wgs84"（默认按 wgs84 处理，即先纠偏） */
export function normalizeToGcj02(latitude, longitude, coordType) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (String(coordType || "").toLowerCase() === "gcj02") return { latitude, longitude };
  return wgs84ToGcj02(latitude, longitude);
}

/** 约定上存储的地点提醒坐标 → GCJ-02（location_reminder.coord_type 记录来源） */
export function taskReminderToGcj02(reminder) {
  if (!reminder || typeof reminder.latitude !== "number" || typeof reminder.longitude !== "number") {
    return null;
  }
  return normalizeToGcj02(reminder.latitude, reminder.longitude, reminder.coord_type);
}

export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (v) => (v * PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * 顺路（on-the-way）方向判定：
 * - prev → cur 是用户的实际位移向量，cur → poi 是前往地点的向量
 * - 仅在用户确实移动（≥ minMoveM）且地点位于行进方向前方（偏离角 ≤ maxAngleDeg）时认为"顺路"
 * 返回 { onTheWay, angleDeg, movedM, closing }；缺少 prev 时退化为 { onTheWay: null }（不表态）
 */
export function judgeOnTheWay(prev, cur, poi, { minMoveM = 30, maxAngleDeg = 70 } = {}) {
  if (!prev || !cur || typeof prev.latitude !== "number" || typeof prev.longitude !== "number") {
    return { onTheWay: null };
  }
  const movedM = haversineMeters(prev, cur);
  if (movedM < minMoveM) return { onTheWay: false, movedM, reason: "not_moving" };

  // 局部平面近似（短距离内精确够用）：转东北天坐标系（米）
  const toLocal = (p, origin) => {
    const toRad = (v) => (v * PI) / 180;
    const latR = toRad(origin.latitude);
    return {
      x: (p.longitude - origin.longitude) * 111320 * Math.cos(latR),
      y: (p.latitude - origin.latitude) * 110540
    };
  };
  const v = { x: toLocal(cur, prev).x, y: toLocal(cur, prev).y }; // 位移向量
  const p = toLocal(poi, cur);                                     // 地点向量
  const vLen = Math.hypot(v.x, v.y);
  const pLen = Math.hypot(p.x, p.y);
  if (vLen < 1 || pLen < 1) return { onTheWay: false, movedM, reason: "degenerate" };

  const dot = (v.x * p.x + v.y * p.y) / (vLen * pLen);
  const angleDeg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / PI;
  return { onTheWay: angleDeg <= maxAngleDeg, angleDeg, movedM };
}
