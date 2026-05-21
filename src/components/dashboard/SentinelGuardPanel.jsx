import React, { useEffect, useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import GeoAwarenessCard from "@/components/smart/GeoAwarenessCard";
import ForgettingRescueCard from "@/components/smart/ForgettingRescueCard";
import AssociationRuleCard from "@/components/smart/AssociationRuleCard";
import { toast } from "sonner";
import { Shield } from "lucide-react";

/**
 * 时空感知守护面板 - 聚合地理感知 + 遗忘拯救两类真实数据卡片
 */
// 模块级缓存：同一会话内 5 分钟内复用结果，避免来回切页面时重复打后端导致 429
const GUARD_CACHE = { ts: 0, data: null, assoc: null };
const GUARD_TTL_MS = 5 * 60 * 1000;

export default function SentinelGuardPanel() {
  const [data, setData] = useState(GUARD_CACHE.data);
  const [assoc, setAssoc] = useState(GUARD_CACHE.assoc);
  const [loading, setLoading] = useState(!GUARD_CACHE.data);
  const [coords, setCoords] = useState(null);
  const [dismissed, setDismissed] = useState({ geo: false, forget: false });
  const fetchedRef = useRef(false); // 同一组件实例只发一次

  // 获取定位（静默降级）
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }
    );
  }, []);

  const fetchGuard = useCallback(async () => {
    // 命中模块缓存就直接复用，不再请求
    if (Date.now() - GUARD_CACHE.ts < GUARD_TTL_MS && GUARD_CACHE.data) {
      setData(GUARD_CACHE.data);
      setAssoc(GUARD_CACHE.assoc);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [guardRes, assocRes] = await Promise.all([
        base44.functions.invoke('getSentinelGuard', coords || {}),
        base44.functions.invoke('getAssociationRecommendations', coords || {})
      ]);
      const g = guardRes?.data || null;
      const a = assocRes?.data || null;
      GUARD_CACHE.ts = Date.now();
      GUARD_CACHE.data = g;
      GUARD_CACHE.assoc = a;
      setData(g);
      setAssoc(a);
    } catch (e) {
      // 429 时拉长 TTL，避免快速重试雪崩
      const status = e?.response?.status;
      if (status === 429 || /rate limit/i.test(e?.message || '')) {
        GUARD_CACHE.ts = Date.now(); // 视为刚刚拉过，5min 内不再重试
        console.warn('[sentinel-guard] 命中限流，5 分钟内不再重试');
      } else {
        console.warn('[sentinel-guard] 拉取失败', e);
      }
    } finally {
      setLoading(false);
    }
  }, [coords]);

  useEffect(() => {
    // 仅在 coords 首次确定后发一次；如果一直没拿到 coords，也在 1.5s 后用空坐标兜底发一次
    if (fetchedRef.current) return;
    if (coords) {
      fetchedRef.current = true;
      fetchGuard();
      return;
    }
    const fallback = setTimeout(() => {
      if (fetchedRef.current) return;
      fetchedRef.current = true;
      fetchGuard();
    }, 1500);
    return () => clearTimeout(fallback);
  }, [coords, fetchGuard]);

  const handleSnooze = (type) => {
    setDismissed((prev) => ({ ...prev, [type]: true }));
    toast('已稍后提醒');
  };

  const hasGeo = data?.geo_context && !dismissed.geo;
  const hasForget = data?.forgetting_rescue?.primary && !dismissed.forget;
  const hasAssoc = !!(assoc?.sequential_recommendation || assoc?.location_pattern);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        <div className="inline-flex items-center gap-2">
          <Shield className="w-4 h-4 animate-pulse" />
          分析时空情境中…
        </div>
      </div>
    );
  }

  if (!hasGeo && !hasForget && !hasAssoc) {
    return (
      <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <Shield className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-slate-600 text-sm font-medium mb-1">一切安好</p>
        <p className="text-xs text-slate-400">没有检测到需要守护的情境事件</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasGeo && (
        <GeoAwarenessCard
          data={data.geo_context}
          onSnooze={() => handleSnooze('geo')}
        />
      )}
      {hasForget && (
        <ForgettingRescueCard
          data={data.forgetting_rescue}
          onSnooze={() => handleSnooze('forget')}
        />
      )}
      {hasAssoc && (
        <AssociationRuleCard
          sequential={assoc.sequential_recommendation}
          location={assoc.location_pattern}
        />
      )}
    </div>
  );
}