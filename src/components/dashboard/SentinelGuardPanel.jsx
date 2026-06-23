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
// 模块级缓存：会话内常驻，不再按时间过期。
// 刷新由 Task / Note / SavedLocation 的实时订阅事件驱动，或用户手动点击"重新分析"。
const GUARD_CACHE = { ts: 0, data: null, assoc: null, dirty: false };
const GUARD_TTL_MS = Infinity;
// 单次请求最长 12 秒：超时则静默回退，不再让用户长时间盯着 loading
const REQUEST_TIMEOUT_MS = 12000;

export default function SentinelGuardPanel() {
  const [data, setData] = useState(GUARD_CACHE.data);
  const [assoc, setAssoc] = useState(GUARD_CACHE.assoc);
  const [loading, setLoading] = useState(!GUARD_CACHE.data);
  const [errored, setErrored] = useState(false);
  const [dismissed, setDismissed] = useState({ geo: false, forget: false });
  const fetchedRef = useRef(false);

  const fetchGuard = async (force = false) => {
    // 命中模块缓存就直接复用：除非数据被订阅事件标记为 dirty，或调用方明确 force
    if (!force && !GUARD_CACHE.dirty && GUARD_CACHE.data) {
      setData(GUARD_CACHE.data);
      setAssoc(GUARD_CACHE.assoc);
      setLoading(false);
      return;
    }
    GUARD_CACHE.dirty = false;
    setLoading(true);
    setErrored(false);

    // 静默拿一次定位（不阻塞主流程：拿不到就用空坐标）
    let coords = {};
    if ('geolocation' in navigator) {
      coords = await new Promise((resolve) => {
        const t = setTimeout(() => resolve({}), 1200);
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(t); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
          () => { clearTimeout(t); resolve({}); },
          { enableHighAccuracy: false, timeout: 1200, maximumAge: 300000 }
        );
      });
    }

    // 单请求超时保护：任一后端 15 秒内未返回，立即放弃 loading
    const withTimeout = (p) => Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS))
    ]);

    const isMissingCapability = (reason) => {
      const status = reason?.status || reason?.response?.status;
      const code = reason?.data?.error;
      return status === 404 || code === "NOT_FOUND" || /未找到函数|not found/i.test(reason?.message || "");
    };

    try {
      // 用 allSettled 而不是 all：一个失败不应该让另一个的结果也丢失
      const [guardRes, assocRes] = await Promise.allSettled([
        withTimeout(base44.functions.invoke('getSentinelGuard', coords)),
        withTimeout(base44.functions.invoke('getAssociationRecommendations', coords))
      ]);
      const g = guardRes.status === 'fulfilled' ? (guardRes.value?.data || null) : null;
      const a = assocRes.status === 'fulfilled' ? (assocRes.value?.data || null) : null;

      // 只有两个都失败、且都不是限流时才显示错误；任一成功即写入缓存并正常展示
      const guardFailed = guardRes.status === 'rejected';
      const assocFailed = assocRes.status === 'rejected';
      if (guardFailed && assocFailed) {
        const guardMsg = guardRes.reason?.message || '';
        const assocMsg = assocRes.reason?.message || '';
        const isRateLimit =
          /rate limit/i.test(guardMsg) || (guardRes.reason?.status || guardRes.reason?.response?.status) === 429 ||
          /rate limit/i.test(assocMsg) || (assocRes.reason?.status || assocRes.reason?.response?.status) === 429;
        const isMissing =
          isMissingCapability(guardRes.reason) &&
          isMissingCapability(assocRes.reason);
        if (isRateLimit) {
          GUARD_CACHE.ts = Date.now();
          console.warn('[sentinel-guard] 命中限流，5 分钟内不再重试');
        } else if (isMissing) {
          GUARD_CACHE.ts = Date.now();
          GUARD_CACHE.data = null;
          GUARD_CACHE.assoc = null;
        } else {
          console.warn('[sentinel-guard] 拉取失败', guardRes.reason, assocRes.reason);
          setErrored(true);
        }
      } else {
        GUARD_CACHE.ts = Date.now();
        GUARD_CACHE.data = g;
        GUARD_CACHE.assoc = a;
        if (guardFailed && !isMissingCapability(guardRes.reason)) console.warn('[sentinel-guard] guard 失败但 assoc 成功', guardRes.reason);
        if (assocFailed && !isMissingCapability(assocRes.reason)) console.warn('[sentinel-guard] assoc 失败但 guard 成功', assocRes.reason);
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

  // 事件驱动:Task / Note / SavedLocation 任一变化只把缓存标记为 dirty,
  // 不立即 refetch —— 避免在 executeAutomation 等长流程中频繁调用 2 个高消耗后端,
  // 把 base44 quota 打到 429,反过来又让关键调用 500。
  // 用户下次手动点击"重新分析"或重新进入页面时才会真正拉取最新结果。
  useEffect(() => {
    const markDirty = () => { GUARD_CACHE.dirty = true; };
    const unsubs = [];
    try { const u = base44.entities.Task?.subscribe?.(markDirty); if (u) unsubs.push(u); } catch (_error) { void _error; }
    try { const u = base44.entities.Note?.subscribe?.(markDirty); if (u) unsubs.push(u); } catch (_error) { void _error; }
    try { const u = base44.entities.SavedLocation?.subscribe?.(markDirty); if (u) unsubs.push(u); } catch (_error) { void _error; }
    return () => { unsubs.forEach((u) => { try { u?.(); } catch (_error) { void _error; } }); };
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

  if (errored || (!hasGeo && !hasForget && !hasAssoc)) {
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
