import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Read user preference once to decide whether to enable tracking.
// We don't block the hook on this — if pref says off, we just skip reporting.
async function readTrackingPref() {
  try {
    const prefs = await base44.entities.UserPreference.list();
    const p = prefs?.[0];
    // Default: enabled (backward compatible). Only disable when explicitly false.
    return p?.location_tracking_enabled !== false;
  } catch {
    return true;
  }
}

/**
 * Continuously tracks user geolocation and reports to backend geofence trigger.
 * - Checks position every `intervalMs` milliseconds (default 2 min)
 * - Only calls backend if position has moved meaningfully (>30m)
 * - Backend handles geofence logic + AI reminder generation
 */
export function useGeolocation({ enabled = true, intervalMs = 120000 } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [permission, setPermission] = useState('prompt');
  const lastSentRef = useRef(null);
  const timerRef = useRef(null);
  const trackingEnabledRef = useRef(true);

  // Cache user preference on mount
  useEffect(() => {
    readTrackingPref().then((v) => { trackingEnabledRef.current = v; });
  }, []);

  // Check permission state
  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'geolocation' }).then((res) => {
      setPermission(res.state);
      res.onchange = () => setPermission(res.state);
    }).catch(() => {});
  }, []);

  // Distance helper
  const distanceMeters = (a, b) => {
    if (!a || !b) return Infinity;
    const R = 6371000;
    const toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(x));
  };

  const checkAndReport = async () => {
    if (!navigator.geolocation) {
      setError('当前浏览器不支持地理定位');
      return;
    }
    if (!trackingEnabledRef.current) return;
    if (permission === 'denied') return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp
        };
        setPosition(coords);
        setError(null);

        // Only report if moved >30m from last sent (or first time)
        const moved = distanceMeters(lastSentRef.current, coords);
        if (moved < 30) return;

        try {
          const res = await base44.functions.invoke('geofenceTrigger', {
            latitude: coords.latitude,
            longitude: coords.longitude
          });
          lastSentRef.current = coords;

          // Surface triggered reminders via custom event (NotificationManager can listen)
          if (res?.data?.reminders?.length > 0) {
            window.dispatchEvent(new CustomEvent('geofence-triggered', {
              detail: res.data.reminders
            }));
          }
        } catch (e) {
          console.error('Geofence check failed:', e);
        }

        // Additional: AI-driven "on-the-way" matcher for nearby POIs vs errand tasks
        // (independent of saved geofences — finds shops on the route)
        try {
          const matchRes = await base44.functions.invoke('nearbyTaskMatcher', {
            latitude: coords.latitude,
            longitude: coords.longitude
          });
          if (matchRes?.data?.matched && matchRes.data.card) {
            window.dispatchEvent(new CustomEvent('on-the-way-reminder', {
              detail: { card: matchRes.data.card }
            }));
          }
        } catch (e) {
          console.warn('Nearby task match failed:', e);
        }
      },
      (err) => {
        setError(err.message);
        if (err.code === 1) setPermission('denied');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    if (!enabled || permission === 'denied') return;

    // Initial check
    checkAndReport();

    // Periodic check
    timerRef.current = setInterval(checkAndReport, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, permission]);

  const requestPermission = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
        setPermission('granted');
      },
      (err) => {
        setError(err.message);
        if (err.code === 1) setPermission('denied');
      }
    );
  };

  return { position, error, permission, requestPermission, checkNow: checkAndReport };
}