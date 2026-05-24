import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { registerPWA } from '@/lib/pwaRegister';

/**
 * 管理浏览器 Push 订阅。
 * 后端应保存 subscription 到 UserPreference.push_subscription。
 * VAPID 公钥通过后端函数 getVapidPublicKey 获取（可选）。
 */
export function usePushSubscription({ onChange } = {}) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
    setSupported(ok);
    if (!ok) return;

    setPermission(Notification.permission);
    registerPWA();

    const refreshState = async () => {
      try {
        setPermission(Notification.permission);
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {}
    };

    refreshState();

    // 监听权限变化（用户在浏览器站点设置里改了权限）
    let permStatus = null;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'notifications' })
        .then((status) => {
          permStatus = status;
          status.onchange = () => refreshState();
        })
        .catch(() => {});
    }

    // 兜底：iframe 环境下 permissions.query 经常静默失败，且 Notification.permission
    // 在用户从浏览器设置里改了权限后不一定立即同步到当前页。
    // 用一个轻量轮询（前 30 秒内每 2 秒检查一次）兜底状态变化。
    let pollCount = 0;
    const pollTimer = setInterval(() => {
      pollCount += 1;
      refreshState();
      if (pollCount >= 15) clearInterval(pollTimer);
    }, 2000);

    // 页面重新可见时刷新一次（用户从浏览器设置返回）
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshState();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refreshState);

    // 监听 SW 自动重订阅事件（Push 订阅过期时会触发）
    const onSWMessage = async (event) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && event.data.subscription) {
        try {
          await base44.functions.invoke('savePushSubscription', {
            subscription: event.data.subscription,
            user_agent: navigator.userAgent
          });
          refreshState();
        } catch (e) {
          console.warn('[push] 自动重订阅同步失败', e);
        }
      }
    };
    navigator.serviceWorker?.addEventListener?.('message', onSWMessage);

    return () => {
      if (permStatus) permStatus.onchange = null;
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refreshState);
      navigator.serviceWorker?.removeEventListener?.('message', onSWMessage);
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || busy) return false;
    setBusy(true);
    try {
      // 用户点按钮时，先强制读取一次当前权限（应对从浏览器设置改完没回流到 state 的情况）
      let perm = Notification.permission;
      if (perm !== 'granted') {
        perm = await Notification.requestPermission();
      }
      setPermission(perm);
      if (perm !== 'granted') return false;

      // 取 VAPID 公钥 —— 没有它服务器永远推不出通知，必须拿到才能订阅
      let applicationServerKey = null;
      try {
        const r = await base44.functions.invoke('getVapidPublicKey', {});
        if (r?.data?.publicKey) applicationServerKey = urlBase64ToUint8Array(r.data.publicKey);
      } catch (e) {
        console.warn('[push] 获取 VAPID 公钥失败', e);
      }
      if (!applicationServerKey) {
        console.error('[push] 缺少 VAPID 公钥，无法订阅后台推送');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // 如果已经有订阅但用的是旧密钥，先取消再重订阅
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        try { await existing.unsubscribe(); } catch {}
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      const json = sub.toJSON();
      await base44.functions.invoke('savePushSubscription', {
        subscription: json,
        user_agent: navigator.userAgent
      });

      setSubscribed(true);
      onChange && onChange(true);
      return true;
    } catch (e) {
      console.warn('[push] 订阅失败', e);
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, busy, onChange]);

  const unsubscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await base44.functions.invoke('savePushSubscription', { subscription: null });
      setSubscribed(false);
      onChange && onChange(false);
    } finally {
      setBusy(false);
    }
  }, [supported, busy, onChange]);

  return { supported, permission, subscribed, busy, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}