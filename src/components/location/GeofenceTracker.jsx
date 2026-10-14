import React, { useEffect } from 'react';
import { useGeolocation } from '@/components/hooks/useGeolocation';
import { toast } from 'sonner';
import ReminderActionCard from '@/components/notifications/ReminderActionCard';
import { formatDistance } from '@/lib/reminderActions';

/**
 * Invisible component that activates geolocation tracking app-wide.
 * Mount once in Layout.jsx to enable geofence-based reminders.
 */
export default function GeofenceTracker() {
  // 临时关闭主动轮询：和 SentinelGeoWatcher / DeviceHeartbeat 叠加会持续把 base44 quota 打到 429，
  // 导致 executeAutomation 等关键调用返回 500。用户实际地理围栏功能仍可通过 SentinelGeoWatcher 走，
  // 这里只保留事件监听用于本地 toast 展示。
  const { permission, error } = useGeolocation({ enabled: false, intervalMs: 600000 });

  // Listen to geofence trigger events and show interactive reminder cards
  useEffect(() => {
    const handler = (e) => {
      const reminders = e.detail || [];
      reminders.forEach((r) => {
        if (!r?.task_id) return;
        // 地理提醒自带与目标地点的距离（米）：到点附近/路过时给用户距离感知
        const dText = Number.isFinite(Number(r.distance))
          ? `距「${r.location_name || '目标地点'}」${formatDistance(Number(r.distance))}`
          : null;
        toast.custom(
          (t) => (
            <ReminderActionCard
              task={{ id: r.task_id, title: r.title }}
              title={r.title}
              distanceText={dText}
              onClose={() => toast.dismiss(t)}
              onAction={() => toast.dismiss(t)}
            />
          ),
          {
            duration: 15000,
            unstyled: true,
            classNames: { toast: '!bg-transparent !border-0 !shadow-none !p-0' },
          }
        );
      });
    };
    window.addEventListener('geofence-triggered', handler);
    return () => window.removeEventListener('geofence-triggered', handler);
  }, []);

  // Silent component
  if (error) console.warn('[Geofence]', error);
  return null;
}
