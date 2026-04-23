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
const MIN_MOVE_M = 40;
const DEFAULT_INTERVAL_MS = 90 * 1000; // 90s

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

  useEffect(() => {
    if (!navigator?.geolocation) return;

    const tick = () => {
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
            console.warn('[SentinelGeoWatcher] trigger failed:', e?.message);
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

    // 启动后先跑一次，然后按间隔轮询
    const startup = setTimeout(tick, 5000);
    timerRef.current = setInterval(tick, intervalMs);

    return () => {
      clearTimeout(startup);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [intervalMs]);

  return null;
}