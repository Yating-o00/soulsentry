import React, { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { MapPin, AlertTriangle, Bell } from 'lucide-react';

/**
 * SentinelGeoWatcher
 * 基于 HTML5 Geolocation 的"任务级"地理围栏监听器。
 * - 每 intervalMs 做一次定位，移动超过 MIN_MOVE_M 才上报
 * - 调用 sentinelGeofenceTrigger，由 sentinelBrain 做实时适宜性复核
 * - 命中后由 deliverSentinelNotification 负责系统推送；前端再弹出一条应用内提示
 *
 * 与已有 GeofenceTracker（SavedLocation 维度）并行工作，互不干扰。
 */
const MIN_MOVE_M = 80;                       // 移动 80m 以内视为静止，不上报
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;   // 10 分钟轮询一次（原 2 分钟太频繁，叠加其他后台任务会撞 base44 429）
const STARTUP_DELAY_MS = 60 * 1000;           // 启动 60s 后再发首次，给页面初始化让路
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000; // 命中 429 后暂停 30 分钟

function distance(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2
    + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

const LEVEL_STYLES = {
  critical: { icon: AlertTriangle, className: 'text-rose-500', duration: 15000 },
  assertive: { icon: Bell, className: 'text-amber-500', duration: 12000 },
  standard: { icon: MapPin, className: 'text-blue-500', duration: 8000 },
  ambient: { icon: MapPin, className: 'text-slate-400', duration: 5000 },
  silent: null
};

export default function SentinelGeoWatcher({ intervalMs = DEFAULT_INTERVAL_MS }) {
  const lastSentRef = useRef(null);
  const timerRef = useRef(null);
  const inflightRef = useRef(false);
  const cooldownUntilRef = useRef(0); // 429 退避截止时间戳

  useEffect(() => {
    if (!navigator?.geolocation) return;

    const tick = () => {
      // 命中过 429？暂停到冷却结束
      if (Date.now() < cooldownUntilRef.current) return;
      if (inflightRef.current) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          // 首次或移动距离超过阈值才上报
          const moved = distance(lastSentRef.current, coords);
          if (lastSentRef.current && moved < MIN_MOVE_M) return;

          inflightRef.current = true;
          try {
            const res = await base44.functions.invoke('sentinelGeofenceTrigger', coords);
            lastSentRef.current = coords;
            const results = res?.data?.results || [];
            results.forEach((r) => {
              const style = LEVEL_STYLES[r.level] || LEVEL_STYLES.standard;
              if (!style) return; // silent
              const Icon = style.icon;
              const eventLabel = r.event === 'enter' ? '到达' : '离开';
              toast(`📍 ${eventLabel}「${r.location_name}」附近`, {
                description: r.context_summary || r.task_title,
                icon: <Icon className={`w-4 h-4 ${style.className}`} />,
                duration: style.duration,
                action: {
                  label: '查看',
                  onClick: () => { window.location.href = `/Tasks?taskId=${r.task_id}`; }
                }
              });
            });
          } catch (e) {
            // 命中限流则进入冷却，避免持续打 base44
            const status = e?.response?.status;
            if (status === 429 || /rate limit/i.test(e?.message || '')) {
              cooldownUntilRef.current = Date.now() + RATE_LIMIT_COOLDOWN_MS;
              console.warn('[SentinelGeoWatcher] 命中限流，暂停 10 分钟');
            } else {
              console.warn('[SentinelGeoWatcher] trigger failed:', e?.message);
            }
          } finally {
            inflightRef.current = false;
          }
        },
        (err) => {
          console.warn('[SentinelGeoWatcher] geolocation error:', err?.message);
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    // 启动后先延迟一段时间再跑首次，避免与页面初始加载的并发请求堆叠
    const startup = setTimeout(tick, STARTUP_DELAY_MS);
    timerRef.current = setInterval(tick, intervalMs);

    // 关键：页面/PWA 从后台切回前台时立刻补跑一次
    // —— 这是浏览器允许的"用户回来那一刻补一次位置匹配"的最佳时机
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);

    return () => {
      clearTimeout(startup);
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);

  return null;
}