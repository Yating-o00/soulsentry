// 提醒小组件的共享逻辑：距离感知、延后档位建议、轻轻放下状态判断

export function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(a.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 350 → "约 350 米"；1500 → "约 1.5 公里"
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return null;
  if (meters < 1000) return `约 ${Math.round(meters / 10) * 10} 米`;
  return `约 ${(meters / 1000).toFixed(1).replace(/\.0$/, "")} 公里`;
}

let cachedPos = null;
let cachedAt = 0;

// 一次性取当前位置（60 秒进程内缓存）。拒绝/超时时返回旧缓存或 null，绝不 reject。
export function getCurrentPositionCached({ maxAgeMs = 60000 } = {}) {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  if (cachedPos && Date.now() - cachedAt < maxAgeMs) return Promise.resolve(cachedPos);
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          cachedPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          cachedAt = Date.now();
          resolve(cachedPos);
        },
        () => resolve(cachedPos),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    } catch {
      resolve(cachedPos);
    }
  });
}

// 延后档位建议：根据约定内容选择 15 / 30 / 60 分钟
// - 时效敏感（吃药、饭点、会议、回复、缴费）→ 15 分钟
// - 外出行事（买、取快递、顺路、超市、加油）→ 30 分钟
// - 其余 → 1 小时
export function suggestSnoozeMinutes(task) {
  const text = `${task?.title || ""} ${task?.description || ""}`;
  if (/药|吃|喝|饭|餐|会议|开会|电话|邮件|消息|回复|打卡|签到|缴费|报名|取号/.test(text)) {
    return { minutes: 15, reason: "这类约定时效紧，15 分钟后轻轻唤你" };
  }
  if (/买|超市|菜|快递|取|顺路|逛|打印|寄|银行|医院|加油/.test(text)) {
    return { minutes: 30, reason: "外出类约定，30 分钟后再提醒你" };
  }
  return { minutes: 60, reason: "1 小时后再来提醒你" };
}

// 轻轻放下是否生效中（前端展示层守卫，与 reminderSender.js 的后端守卫一致）
export function isTaskGentlyDismissed(task, nowMs = Date.now()) {
  const until = task?.gentle_dismiss_until ? new Date(task.gentle_dismiss_until).getTime() : null;
  return !!until && !isNaN(until) && until > nowMs;
}
