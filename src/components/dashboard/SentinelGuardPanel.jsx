import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import GeoAwarenessCard from "@/components/smart/GeoAwarenessCard";
import ForgettingRescueCard from "@/components/smart/ForgettingRescueCard";
import AssociationRuleCard from "@/components/smart/AssociationRuleCard";
import { toast } from "sonner";
import { Shield, RefreshCw } from "lucide-react";

/**
 * 时空感知守护面板 - 聚合地理感知 + 遗忘拯救两类真实数据卡片
 */
// 模块级缓存：同一会话内 5 分钟内复用结果，避免来回切页面时重复打后端导致 429
const GUARD_CACHE = { ts: 0, data: null, assoc: null };
const GUARD_TTL_MS = 5 * 60 * 1000;
// 单次请求最长 15 秒，超时则放弃 loading 状态，让用户看到结果（即使是空）或可重试
const REQUEST_TIMEOUT_MS = 15000;

export default function SentinelGuardPanel() {
  const [data, setData] = useState(GUARD_CACHE.data);
  const [assoc, setAssoc] = useState(GUARD_CACHE.assoc);
  const [loading, setLoading] = useState(!GUARD_CACHE.data);
  const [errored, setErrored] = useState(false);
  const [dismissed, setDismissed] = useState({ geo: false, forget: false });
  const fetchedRef = useRef(false);

  const fetchGuard = async (force = false) => {
    // 命中模块缓存就直接复用，不再请求
    if (!force && Date.now() - GUARD_CACHE.ts < GUARD_TTL_MS && GUARD_CACHE.data) {
      setData(GUARD_CACHE.data);
      setAssoc(GUARD_CACHE.assoc);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrored(false);

    // 静默拿一次定位（不阻塞主流程：拿不到就用空坐标）
    let coords = {};
    if ('geolocation' in navigator) {
      coords = await new Promise((resolve) => {
        const t = setTimeout(() => resolve({}), 2000);
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(t); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
          () => { clearTimeout(t); resolve({}); },
          { enableHighAccuracy: false, timeout: 2000, maximumAge: 120000 }
        );
      });
    }

    // 单请求超时保护：任一后端 15 秒内未返回，立即放弃 loading
    const withTimeout = (p) => Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS))
    ]);

    try {
      // 用 allSettled 而不是 all：一个失败不应该让另一个的结果也丢失
      const [guardRes, assocRes] = await Promise.allSettled([
        withTimeout(base44.functions.invoke('getSentinelGuard', coords)),
        withTimeout(base44.functions.invoke('getAssociationRecommendations', coords))
      ]);
      const g = guardRes.status === 'fulfilled' ? (guardRes.value?.data || null) : null;
      const a = assocRes.status === 'fulfilled' ? (assocRes.value?.data || null) : null;

      // 两个都失败才算整体出错
      if (guardRes.status === 'rejected' && assocRes.status === 'rejected') {
        const msg = guardRes.reason?.message || '';
        if (/rate limit/i.test(msg) || guardRes.reason?.response?.status === 429) {
          GUARD_CACHE.ts = Date.now();
          console.warn('[sentinel-guard] 命中限流，5 分钟内不再重试');
        } else {
          console.warn('[sentinel-guard] 拉取失败', guardRes.reason, assocRes.reason);
          setErrored(true);
        }
      } else {
        GUARD_CACHE.ts = Date.now();
        GUARD_CACHE.data = g;
        GUARD_CACHE.assoc = a;
      }
      setData(g);
      setAssoc(a);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchGuard();
  }, []);

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
        <button
          onClick={() => { fetchedRef.current = true; fetchGuard(true); }}
          className="mt-3 block mx-auto text-xs text-[#384877] hover:underline"
        >
          太慢了？点此重试
        </button>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="py-8 text-center bg-rose-50/60 rounded-2xl border border-dashed border-rose-200">
        <Shield className="w-8 h-8 mx-auto mb-2 text-rose-300" />
        <p className="text-rose-600 text-sm font-medium mb-2">分析暂时未完成</p>
        <button
          onClick={() => { fetchedRef.current = true; fetchGuard(true); }}
          className="inline-flex items-center gap-1.5 text-xs text-[#384877] hover:underline"
        >
          <RefreshCw className="w-3 h-3" />
          重新分析
        </button>
      </div>
    );
  }

  if (!hasGeo && !hasForget && !hasAssoc) {
    return (
      <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <Shield className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-slate-600 text-sm font-medium mb-1">一切安好</p>
        <p className="text-xs text-slate-400 mb-2">没有检测到需要守护的情境事件</p>
        <button
          onClick={() => { fetchedRef.current = true; fetchGuard(true); }}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#384877]"
        >
          <RefreshCw className="w-3 h-3" />
          重新分析
        </button>
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