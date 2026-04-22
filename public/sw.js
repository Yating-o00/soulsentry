/* SoulSentry Service Worker — 推送 / 后台同步 / 冷启动缓存 */
/* eslint-disable no-restricted-globals */

const CACHE_VERSION = 'soulsentry-v1';
const PREFS_CACHE = 'soulsentry-prefs-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* ---------- 推送：页面关闭后仍可达 ---------- */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    payload = { title: '心栈提醒', body: event.data ? event.data.text() : '您有一条新提醒' };
  }

  const title = payload.title || '心栈提醒';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    tag: payload.tag || 'soulsentry-notification',
    renotify: true,
    requireInteraction: payload.requireInteraction || false,
    data: {
      url: payload.url || '/',
      taskId: payload.taskId || null,
    },
    actions: payload.actions || [
      { action: 'view', title: '查看' },
      { action: 'later', title: '稍后' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  if (event.action === 'later') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

/* ---------- 后台同步：有限持续定位 ---------- */
/*
 * Periodic Background Sync (Chromium only) —— 需用户把应用加入主屏幕并授权。
 * 兜底：页面存活时，主线程的 useGeolocation 轮询仍在工作。
 * 这里只做：① 拉取一次当前坐标并通过 fetch 上报 geofenceTrigger；② 通知前台刷新。
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'geo-sync') {
    event.waitUntil(runGeoSync());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'geo-sync-once') {
    event.waitUntil(runGeoSync());
  }
});

async function runGeoSync() {
  try {
    // SW 内无法直接调 navigator.geolocation，只能向前台 client 请求坐标
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clientsList.length > 0) {
      clientsList[0].postMessage({ type: 'sw-request-geo' });
      return;
    }
    // 没有活动窗口时：从缓存读取最近一次坐标，若可用则直接上报
    const cache = await caches.open(PREFS_CACHE);
    const res = await cache.match('/__last_geo__');
    if (!res) return;
    const { latitude, longitude, token } = await res.json();
    if (!latitude || !longitude) return;
    await fetch('/functions/geofenceTrigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ latitude, longitude })
    });
  } catch (e) {
    // 静默：后台场景不打扰用户
  }
}

/* ---------- 接收前台消息，写缓存/发送推送订阅 ---------- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'cache-last-geo') {
    event.waitUntil(
      caches.open(PREFS_CACHE).then((cache) =>
        cache.put('/__last_geo__', new Response(JSON.stringify(data.payload || {}), {
          headers: { 'Content-Type': 'application/json' }
        }))
      )
    );
  }
  if (data.type === 'cache-prefs') {
    event.waitUntil(
      caches.open(PREFS_CACHE).then((cache) =>
        cache.put('/__prefs__', new Response(JSON.stringify(data.payload || {}), {
          headers: { 'Content-Type': 'application/json' }
        }))
      )
    );
  }
  if (data.type === 'skip-waiting') self.skipWaiting();
});
