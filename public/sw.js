// SoulSentry Service Worker
// 负责：1) Web Push 接收 + 通知弹窗  2) 通知点击导航  3) 后台同步
// 版本号变更会强制 SW 更新
const SW_VERSION = 'v3-2026-05-24';

self.addEventListener('install', (event) => {
  // 立即激活新 SW，避免旧版本继续接管
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ============================================================
// Push 接收 —— 这是"关闭网页也能弹通知"的核心
// ============================================================
self.addEventListener('push', (event) => {
  // 用 waitUntil 包裹整个流程，确保浏览器在通知显示前不会杀掉 SW
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  let payload = {};

  // 尝试解析 payload —— 即使解析失败也要弹一个兜底通知，否则用户什么都看不到
  try {
    if (event.data) {
      try {
        payload = event.data.json();
      } catch {
        const text = event.data.text();
        payload = { title: 'SoulSentry 提醒', body: text || '您有一条新的提醒' };
      }
    }
  } catch (e) {
    console.warn('[SW] push payload parse failed', e);
  }

  const title = payload.title || 'SoulSentry 提醒';
  const body = payload.body || '您有一条新的提醒，点击查看详情';
  const url = payload.url || '/';
  // 使用唯一 tag + renotify:true 让每条通知都能强制弹出（同 tag 时也会重新通知用户）
  const tag = payload.tag || `soulsentry-${Date.now()}`;
  const data = { url, ...(payload.data || {}) };

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    renotify: true,                  // 同 tag 时也强制响铃 + 弹窗
    requireInteraction: !!payload.requireInteraction, // critical 级别可设为 true
    silent: false,                   // 永远响铃 / 振动
    vibrate: payload.vibrate || [200, 100, 200],
    timestamp: Date.now(),
    data,
    actions: payload.actions || [
      { action: 'open', title: '查看' },
      { action: 'dismiss', title: '稍后' }
    ]
  };

  try {
    await self.registration.showNotification(title, options);
  } catch (e) {
    console.error('[SW] showNotification failed', e);
    // 兜底再尝试一次最简形态
    try {
      await self.registration.showNotification(title, { body });
    } catch {}
  }
}

// ============================================================
// 通知点击 —— 优先聚焦已有窗口，否则打开新窗口
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    // 找到任意一个已打开窗口 → 聚焦它并导航
    for (const client of allClients) {
      try {
        await client.focus();
        if ('navigate' in client) {
          await client.navigate(targetUrl);
        }
        return;
      } catch {}
    }

    // 没有任何窗口 → 打开新窗口
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

// ============================================================
// 订阅变更 —— Chrome/Edge 会在订阅过期时触发，自动重新订阅
// ============================================================
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const oldSub = event.oldSubscription;
      const applicationServerKey = oldSub?.options?.applicationServerKey;
      if (!applicationServerKey) return;
      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
      // 通知主线程把新订阅同步到后端
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach((c) =>
        c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() })
      );
    } catch (e) {
      console.error('[SW] re-subscribe failed', e);
    }
  })());
});

// ============================================================
// 后台同步 —— 保留原有的地理位置同步能力
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'geofence-sync') {
    event.waitUntil(syncGeofences());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'geofence-periodic') {
    event.waitUntil(syncGeofences());
  }
});

async function syncGeofences() {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    if (clients.length > 0) {
      clients[0].postMessage({ type: 'REQUEST_LOCATION_SYNC' });
    }
  } catch (e) {
    console.warn('[SW] geofence sync failed', e);
  }
}

// ============================================================
// 主线程消息 —— 处理立即更新 SW
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
