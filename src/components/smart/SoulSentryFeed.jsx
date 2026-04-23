import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RefreshCcw, Settings2, MapPin, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import PreferenceOnboarding from "@/components/smart/PreferenceOnboarding";
import GeoContextCard from "@/components/smart/GeoContextCard";
import DecisionPreloadCard from "@/components/smart/DecisionPreloadCard";
import OnTheWayCard from "@/components/smart/OnTheWayCard";
import SentinelGuardPanel from "@/components/dashboard/SentinelGuardPanel";
import { sendToSW } from "@/lib/pwaRegister";

const cardComponents = {
  geo_context: GeoContextCard,
  decision_preload: DecisionPreloadCard,
  on_the_way: OnTheWayCard
};

/**
 * 情境哨兵内容流：地理情境 / 决策预加载 / 顺路提醒三类卡片。
 * 可嵌入任意位置（首页、通知中心 Tab 等）。
 */
export default function SoulSentryFeed({ showHeader = true, compact = false }) {
  const { prefs, update, loading } = useUserPreferences();
  const [cards, setCards] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [fetching, setFetching] = useState(false);
  const [coords, setCoords] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!loading && !prefs.onboarded) setShowOnboarding(true);
  }, [loading, prefs.onboarded]);

  useEffect(() => {
    if (!prefs.location_tracking_enabled || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(c);
        sendToSW({ type: 'cache-last-geo', payload: { ...c, at: Date.now() } });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
    );
  }, [prefs.location_tracking_enabled]);

  const fetchCards = useCallback(async () => {
    setFetching(true);
    try {
      const res = await base44.functions.invoke('getSmartContextCards', coords || {});
      setCards(res?.data?.cards || []);
    } catch (e) {
      console.warn('[soul-sentry] 卡片拉取失败', e);
    } finally {
      setFetching(false);
    }
  }, [coords]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleDismiss = (idx) => setDismissed((prev) => new Set(prev).add(idx));
  const handleSnooze = (idx) => {
    setDismissed((prev) => new Set(prev).add(idx));
    toast('已稍后提醒', { description: '我们会在合适的时机再次提示你' });
  };

  const visibleCards = cards.filter((c, i) =>
    !dismissed.has(i) && (prefs.enabled_card_types || []).includes(c.type)
  );

  return (
    <div className={compact ? "" : "space-y-4"}>
      <PreferenceOnboarding
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        prefs={prefs}
        onUpdate={update}
      />

      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">情境哨兵</h3>
              <p className="text-[11px] text-slate-500">合适的时间 · 地点 · 方式</p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={fetchCards} disabled={fetching} title="刷新" className="h-8 w-8">
              <RefreshCcw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowOnboarding(true)} title="偏好" className="h-8 w-8">
              <Settings2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {!prefs.location_tracking_enabled && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
          <MapPin className="w-4 h-4 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-amber-800">
              开启位置，我们才能在你到达公司/家/商场时提醒对应的事情。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowOnboarding(true)} className="h-7 text-xs">
            去开启
          </Button>
        </div>
      )}

      {/* 时空感知守护（真实数据：地理情境 + 遗忘拯救） */}
      <div className="mb-3">
        <SentinelGuardPanel />
      </div>

      <div className="space-y-3">
        {fetching && cards.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">正在分析你的情境…</div>
        )}

        {!fetching && visibleCards.length === 0 && (
          <div className="py-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-slate-600 text-sm font-medium mb-1">暂无需要提醒的事</p>
            <p className="text-xs text-slate-400">
              创建约定、保存地点或写心签，我们会在合适时机提示你。
            </p>
          </div>
        )}

        {visibleCards.map((card, idx) => {
          const Comp = cardComponents[card.type];
          if (!Comp) return null;
          const originalIdx = cards.indexOf(card);
          return (
            <motion.div
              key={`${card.type}-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
            >
              <Comp
                card={card}
                onDismiss={() => handleDismiss(originalIdx)}
                onSnooze={() => handleSnooze(originalIdx)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}