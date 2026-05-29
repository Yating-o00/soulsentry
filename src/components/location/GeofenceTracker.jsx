import React, { useEffect } from 'react';
import { useGeolocation } from '@/components/hooks/useGeolocation';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';

/**
 * Invisible component that activates geolocation tracking app-wide.
 * Mount once in Layout.jsx to enable geofence-based reminders.
 */
export default function GeofenceTracker() {
  // 临时关闭主动轮询：和 SentinelGeoWatcher / DeviceHeartbeat 叠加会持续把 base44 quota 打到 429，
  // 导致 executeAutomation 等关键调用返回 500。用户实际地理围栏功能仍可通过 SentinelGeoWatcher 走，
  // 这里只保留事件监听用于本地 toast 展示。
  const { permission, error } = useGeolocation({ enabled: false, intervalMs: 600000 });

  // Listen to geofence trigger events and show toast
  useEffect(() => {
    const handler = (e) => {
      const reminders = e.detail || [];
      reminders.forEach((r) => {
        toast(r.title, {
          description: r.message,
          icon: <MapPin className="w-4 h-4 text-blue-500" />,
          duration: 8000,
          action: r.top_tasks?.length > 0 ? {
            label: '查看',
            onClick: () => { window.location.href = '/Tasks'; }
          } : undefined
        });
      });
    };
    window.addEventListener('geofence-triggered', handler);
    return () => window.removeEventListener('geofence-triggered', handler);
  }, []);

  // Silent component
  if (error) console.warn('[Geofence]', error);
  return null;
}