import React, { useEffect } from 'react';
import { useGeolocation } from '@/components/hooks/useGeolocation';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';

/**
 * Invisible component that activates geolocation tracking app-wide.
 * Mount once in Layout.jsx to enable geofence-based reminders.
 */
export default function GeofenceTracker() {
  const { permission, error } = useGeolocation({ enabled: true, intervalMs: 120000 });

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