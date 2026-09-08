import { useEffect, useState } from "react";
import { getCachedUser } from "@/lib/userCache";

export default function GoogleAdsTracking() {
  const [user, setUser] = useState(null);

  // gtag bootstrap（含 iframe 事件转发，便于调试面板查看）
  useEffect(() => {
    if (typeof window === 'undefined' || window.__gads_loaded) return;
    window.__gads_loaded = true;
    window.dataLayer = window.dataLayer || [];
    const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
      if (inIframe) {
        try {
          const args = Array.prototype.slice.call(arguments);
          const cmd = args[0];
          window.parent.postMessage({
            type: 'base44_gtag_event',
            event: {
              source: 'gtag',
              timestamp: new Date().toLocaleTimeString(),
              command: cmd,
              params: args.slice(1),
              type: cmd === 'event' ? (args[1] || 'event') : cmd,
            },
          }, '*');
        } catch (_e) { /* relay must not break gtag */ }
      }
    };
    const s = document.createElement('script');
    s.src = 'https://www.googletagmanager.com/gtag/js?id=AW-18437176959';
    s.async = true;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', 'AW-18437176959', { send_page_view: false });
  }, []);

  useEffect(() => {
    getCachedUser().then((u) => setUser(u)).catch(() => {});
  }, []);

  // SIGNUP：注册完成后首次进入应用时上报
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !user.id) return;
    const createdDate = String(user.created_date || '');
    const createdDateUtc = /(?:Z|[+-]\d{2}:?\d{2})$/.test(createdDate)
      ? createdDate
      : createdDate + 'Z';
    const createdAtMs = Date.parse(createdDateUtc);
    const isNewSignup = Number.isFinite(createdAtMs) &&
      Date.now() - createdAtMs < 24 * 60 * 60 * 1000;
    const key = '_aw_signup_fired_AW-18437176959/K4FXCIn-_vAcEP_8w9dE_' + user.id;
    if (!isNewSignup || localStorage.getItem(key)) return;
    let tries = 0;
    const fire = () => {
      if (!window.gtag) { if (tries++ < 20) setTimeout(fire, 250); return; }
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      window.gtag('event', 'conversion', {
        send_to: 'AW-18437176959/K4FXCIn-_vAcEP_8w9dE',
        transaction_id: user.id,
      });
    };
    fire();
  }, [user]);

  return null;
}