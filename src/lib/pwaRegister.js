/**
 * PWA 注册与运行时协调：
 * - 注册 Service Worker
 * - 向 SW 同步用户偏好与最近一次坐标，供冷启动/后台同步使用
 * - 处理 SW 要求的坐标请求（periodicsync 场景）
 */

let registrationPromise = null;

export function registerPWA() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (registrationPromise) return registrationPromise;

  registrationPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => {
    console.warn('[PWA] SW 注册失败:', e);
    return null;
  });

  // 当 SW 需要坐标时，由前台拉取并回写缓存 + 直接上报
  navigator.serviceWorker.addEventListener('message', (evt) => {
    const data = evt.data || {};
    if (data.type === 'sw-request-geo' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          sendToSW({
            type: 'cache-last-geo',
            payload: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              at: Date.now()
            }
          });
          // 同步上报一次
          import('@/api/base44Client').then(({ base44 }) => {
            base44.functions.invoke('geofenceTrigger', {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            }).catch(() => {});
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
      );
    }
  });

  return registrationPromise;
}

export async function sendToSW(message) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await (registrationPromise || registerPWA());
  const target = (reg && reg.active) || navigator.serviceWorker.controller;
  if (target) target.postMessage(message);
}

export async function requestPeriodicGeoSync() {
  try {
    const reg = await (registrationPromise || registerPWA());
    if (!reg || !('periodicSync' in reg)) return false;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await reg.periodicSync.register('geo-sync', { minInterval: 15 * 60 * 1000 });
    return true;
  } catch (e) {
    return false;
  }
}

export async function requestOneTimeGeoSync() {
  try {
    const reg = await (registrationPromise || registerPWA());
    if (!reg || !('sync' in reg)) return false;
    await reg.sync.register('geo-sync-once');
    return true;
  } catch (e) {
    return false;
  }
}