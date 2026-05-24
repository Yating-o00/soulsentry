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

    // 页面重新可见时刷新一次（用户从浏览器设置返回）
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshState();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refreshState);

    return () => {
      if (permStatus) permStatus.onchange = null;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refreshState);
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || busy) return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      // 取 VAPID 公钥（可选；若未配置则只做本地通知）
      let applicationServerKey = null;
      try {
        const r = await base44.functions.invoke('getVapidPublicKey', {});
        if (r?.data?.publicKey) applicationServerKey = urlBase64ToUint8Array(r.data.publicKey);
      } catch {}

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey || undefined
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