import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCcw, Settings2, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import PreferenceOnboarding from "@/components/smart/PreferenceOnboarding";
import GeoContextCard from "@/components/smart/GeoContextCard";
import DecisionPreloadCard from "@/components/smart/DecisionPreloadCard";
import OnTheWayCard from "@/components/smart/OnTheWayCard";
import { sendToSW } from "@/lib/pwaRegister";

const cardComponents = {
  geo_context: GeoContextCard,
  decision_preload: DecisionPreloadCard,
  on_the_way: OnTheWayCard
};

export default function Home() {
  const { prefs, update, loading } = useUserPreferences();
  const [cards, setCards] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [fetching, setFetching] = useState(false);
  const [coords, setCoords] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // 冷启动：首次用户尚未 onboarded → 自动弹出引导
  useEffect(() => {
    if (!loading && !prefs.onboarded) {
      setShowOnboarding(true);
    }
  }, [loading, prefs.onboarded]);

  // 定位：若用户允许，一次性取坐标并缓存到 SW
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
      console.warn('[home] 卡片拉取失败', e);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-purple-50/20 p-4 md:p-8">
      <PreferenceOnboarding
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        prefs={prefs}
        onUpdate={update}
      />

      <div className="max-w-3xl mx-auto">
        {/* 头部 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">此刻 · 情境哨兵</h1>
              <p className="text-xs md:text-sm text-slate-500">
                合适的时间 · 合适的地点 · 合适的方式
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={fetchCards} disabled={fetching} title="刷新">
              <RefreshCcw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowOnboarding(true)} title="偏好">
              <Settings2 className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>

        {/* 状态提示 */}
        {!prefs.location_tracking_enabled && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
            <MapPin className="w-4 h-4 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-800">
                开启位置，我们才能在你到达公司/家/商场时提醒对应的事情。
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowOnboarding(true)}>
              去开启
            </Button>
          </div>
        )}

        {/* 卡片列表 */}
        <div className="space-y-4">
          {fetching && cards.length === 0 && (
            <div className="py-16 text-center text-slate-400 text-sm">正在分析你的情境…</div>
          )}

          {!fetching && visibleCards.length === 0 && (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-slate-600 font-medium mb-1">暂无需要提醒的事</p>
              <p className="text-sm text-slate-400">
                创建约定、保存地点或写心签，我们会在合适的时机来找你。
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
    </div>
  );
}