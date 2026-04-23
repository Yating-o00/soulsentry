import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import GeoAwarenessCard from "@/components/smart/GeoAwarenessCard";
import ForgettingRescueCard from "@/components/smart/ForgettingRescueCard";
import { toast } from "sonner";
import { Shield } from "lucide-react";

/**
 * 时空感知守护面板 - 聚合地理感知 + 遗忘拯救两类真实数据卡片
 */
export default function SentinelGuardPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState(null);
  const [dismissed, setDismissed] = useState({ geo: false, forget: false });

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
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getSentinelGuard', coords || {});
      setData(res?.data || null);
    } catch (e) {
      console.warn('[sentinel-guard] 拉取失败', e);
    } finally {
      setLoading(false);
    }
  }, [coords]);

  useEffect(() => {
    fetchGuard();
  }, [fetchGuard]);

  const handleSnooze = (type) => {
    setDismissed((prev) => ({ ...prev, [type]: true }));
    toast('已稍后提醒');
  };

  const hasGeo = data?.geo_context && !dismissed.geo;
  const hasForget = data?.forgetting_rescue?.primary && !dismissed.forget;

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

  if (!hasGeo && !hasForget) {
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
    </div>
  );
}