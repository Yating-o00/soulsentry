import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { sendToSW } from '@/lib/pwaRegister';

const LOCAL_KEY = 'soulsentry:prefs:v1';

const DEFAULTS = {
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  preferred_reminder_style: 'standard',
  enabled_card_types: ['geo_context', 'decision_preload', 'on_the_way'],
  location_tracking_enabled: false,
  push_enabled: false,
  onboarded: false,
  home_locations: []
};

/**
 * 冷启动数据：先从 localStorage 同步读出偏好（0ms 可用），
 * 随后异步从服务器拉取最新版本并回写缓存。
 */
export function useUserPreferences() {
  const [prefs, setPrefs] = useState(() => {
    if (typeof window === 'undefined') return DEFAULTS;
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [loading, setLoading] = useState(true);
  const [recordId, setRecordId] = useState(null);

  // 异步拉取服务端最新偏好并合并
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await base44.entities.UserPreference.list('-updated_date', 1);
        if (!mounted) return;
        if (list && list.length > 0) {
          const server = list[0];
          setRecordId(server.id);
          const merged = { ...DEFAULTS, ...server };
          setPrefs(merged);
          writeLocal(merged);
          sendToSW({ type: 'cache-prefs', payload: merged });
        }
      } catch (e) {
        console.warn('[prefs] 拉取失败', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const update = useCallback(async (patch) => {
    const next = { ...prefs, ...patch, last_synced_at: new Date().toISOString() };
    setPrefs(next);
    writeLocal(next);
    sendToSW({ type: 'cache-prefs', payload: next });

    try {
      if (recordId) {
        await base44.entities.UserPreference.update(recordId, patch);
      } else {
        const created = await base44.entities.UserPreference.create({ ...patch });
        setRecordId(created.id);
      }
    } catch (e) {
      console.warn('[prefs] 保存失败', e);
    }
    return next;
  }, [prefs, recordId]);

  return { prefs, update, loading };
}

function writeLocal(data) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {}
}