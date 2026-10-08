/**
 * PWA 注册与运行时协调：
 * - 注册 Service Worker
 * - 页面加载时把 access token 同步给 SW（后端只认 Bearer 头，SW 读不到 localStorage），
 *   供「页面全关」场景下 SW 用缓存坐标直报后端
 * - 处理 SW 的坐标请求（sw-request-geo）：页面取坐标 → 回写 SW 缓存 + 直报 sentinelGeofenceTrigger
 */

import { getAccessToken } from '@/api/httpClient';

let registrationPromise = null;

// 把登录 token 同步给 SW（静默失败，SW 未激活时 postMessage 无处可去）
async function syncGeoAuthToSW() {
  try {
    const token = getAccessToken();
    if (token) await sendToSW({ type: 'cache-geo-auth', payload: { token } });
  } catch {
    /* 静默 */
  }
}

export function registerPWA() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (registrationPromise) return registrationPromise;

  registrationPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => {
    console.warn('[PWA] SW 注册失败:', e);
    return null;
  });

  syncGeoAuthToSW();

  // 当 SW 需要坐标时，由前台拉取并回写缓存 + 直报守护触发器
  navigator.serviceWorker.addEventListener('message', (evt) => {
    const data = evt.data || {};
    if (data.type === 'sw-request-geo' && 'geolocation' in navigator) {
      // 顺手刷新 token，保证 SW 后续无窗口直报时凭证有效
      syncGeoAuthToSW();
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const point = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            // 浏览器原生速度（m/s → km/h），不支持时为 null，服务端会自行跨采样推断
            speedKmh: typeof pos.coords.speed === 'number' && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : null,
            at: Date.now()
          };
          sendToSW({ type: 'cache-last-geo', payload: point });
          // 同步上报一次（与前台 SentinelGeoWatcher 同一条新链路）
          import('@/api/base44Client').then(({ base44 }) => {
            base44.functions
              .invoke('sentinelGeofenceTrigger', {
                latitude: point.latitude,
                longitude: point.longitude,
                accuracy: point.accuracy,
                coord_type: 'wgs84',
                speed_kmh: point.speedKmh
              })
              .catch(() => {});
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