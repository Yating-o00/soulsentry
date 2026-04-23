import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isToday, parseISO, differenceInDays, format } from "date-fns";
import { Shield, Sparkles } from "lucide-react";
import GeoContextCard from "./GeoContextCard";
import ForgettingRescueCard from "./ForgettingRescueCard";
import DecisionPreloadCard from "./DecisionPreloadCard";

/**
 * 情境哨兵展示面板：地理情境感知 / 遗忘拯救 / 决策预加载 三类卡片统一聚合
 * 数据源：Task 实体（已被 sentinelBrain 分析过）+ SavedLocation 实体
 */
export default function SentinelContextPanel() {
  const [dismissed, setDismissed] = useState({ geo: false, forget: false, preload: false });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-updated_date', 200),
    initialData: [],
    staleTime: 30_000,
  });

  const { data: savedLocations = [] } = useQuery({
    queryKey: ['saved-locations'],
    queryFn: () => base44.entities.SavedLocation.filter({ is_active: true }),
    initialData: [],
    staleTime: 60_000,
  });

  const active = useMemo(
    () => tasks.filter((t) => !t.deleted_at && t.status !== 'completed' && t.status !== 'cancelled'),
    [tasks]
  );

  // 1) 地理情境卡：挑一个最近触发 geofence 的任务或绑定常用地点的任务
  const geoCard = useMemo(() => {
    if (dismissed.geo) return null;

    // 优先：最近有 geo_state.last_trigger_at 的任务
    const recentGeoTask = [...active]
      .filter((t) => t.ai_analysis?.geo_state?.last_trigger_at)
      .sort((a, b) => new Date(b.ai_analysis.geo_state.last_trigger_at) - new Date(a.ai_analysis.geo_state.last_trigger_at))[0];

    // 退化：拿一个启用 location_reminder 的任务作为"候选"地点卡
    const locBound = active.find((t) => t.location_reminder?.enabled && t.location_reminder?.location_name);

    const anchor = recentGeoTask || locBound;
    const locName = anchor?.location_reminder?.location_name
      || savedLocations[0]?.name
      || null;
    if (!anchor && !locName) return null;

    // 归类此地点的今日待办
    const todayRelated = active
      .filter((t) => {
        if (!t.reminder_time) return false;
        if (!isToday(parseISO(t.reminder_time))) return false;
        if (anchor?.location_reminder?.location_name && t.location_reminder?.location_name === anchor.location_reminder.location_name) return true;
        // 无 location_reminder 时，按类别粗略归类（office→work）
        const locType = savedLocations.find((s) => s.name === locName)?.location_type;
        if (locType === 'office' && t.category === 'work') return true;
        if (locType === 'home' && ['personal', 'family', 'health'].includes(t.category)) return true;
        return false;
      })
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        title: t.title,
        time: t.reminder_time ? format(parseISO(t.reminder_time), 'HH:mm') : '',
        priority: t.priority,
        overdue_days: t.reminder_time && parseISO(t.reminder_time) < new Date()
          ? Math.max(0, differenceInDays(new Date(), parseISO(t.reminder_time)))
          : 0,
      }));

    const recentlyTriggered = !!recentGeoTask?.ai_analysis?.geo_state?.last_trigger_at
      && (Date.now() - new Date(recentGeoTask.ai_analysis.geo_state.last_trigger_at).getTime() < 2 * 60 * 60 * 1000);

    return {
      title: "地理情境感知",
      subtitle: recentlyTriggered
        ? `进入${locName || '目标地点'}附近 · 刚刚`
        : `常用地点 · ${locName || '已绑定'}`,
      headline: recentlyTriggered
        ? `📍 您已到达${locName}附近${recentGeoTask?.ai_analysis?.geo_state?.last_distance_m ? `（${recentGeoTask.ai_analysis.geo_state.last_distance_m}米）` : ''}`
        : `📍 今日${locName || '此处'}的待办预加载`,
      priority: recentlyTriggered ? 'high' : 'medium',
      today_tasks: todayRelated,
      cta_link: '/Tasks',
    };
  }, [active, savedLocations, dismissed.geo]);

  // 2) 遗忘拯救：超期未完成 + forgetting_risk=high 优先
  const forgetCard = useMemo(() => {
    if (dismissed.forget) return null;

    const now = new Date();
    const candidates = active
      .filter((t) => {
        const risk = t.forgetting_risk;
        const overdue = t.reminder_time && parseISO(t.reminder_time) < now;
        return risk === 'high' || risk === 'medium' || overdue;
      })
      .map((t) => {
        const overdueDays = t.reminder_time
          ? Math.max(0, differenceInDays(now, parseISO(t.reminder_time)))
          : 0;
        const riskWeight = t.forgetting_risk === 'high' ? 100 : t.forgetting_risk === 'medium' ? 50 : 0;
        const score = riskWeight + overdueDays * 10 + (t.priority === 'urgent' ? 30 : t.priority === 'high' ? 15 : 0);
        return { task: t, overdueDays, score };
      })
      .sort((a, b) => b.score - a.score);

    const top = candidates[0];
    if (!top) return null;

    const t = top.task;
    const days = top.overdueDays;
    const riskPct = t.forgetting_risk === 'high' ? 78 : t.forgetting_risk === 'medium' ? 45 : 30;

    return {
      title: "遗忘拯救",
      subtitle: "基于遗忘曲线预警",
      headline: days > 0
        ? `您${days}天前的「${t.title}」还未完成`
        : `「${t.title}」可能被遗忘`,
      risk_note: days > 0
        ? `超过${days}天未完成遗忘率高达${riskPct}%`
        : `当前遗忘风险：${t.forgetting_risk === 'high' ? '高' : '中'}`,
      context_note: t.ai_context_summary || t.description || `最近一次更新于 ${format(new Date(t.updated_date), 'M月d日')}`,
      cta_link: `/Tasks?taskId=${t.id}`,
    };
  }, [active, dismissed.forget]);

  // 3) 决策预加载：最临近/最重要的一件事 + AI 给出的 suggestions
  const preloadCard = useMemo(() => {
    if (dismissed.preload) return null;

    const withAI = active.filter((t) => t.ai_analysis?.suggestions?.length > 0 || t.ai_context_summary);
    const upcoming = [...(withAI.length ? withAI : active)]
      .filter((t) => t.reminder_time)
      .sort((a, b) => new Date(a.reminder_time) - new Date(b.reminder_time))
      .find((t) => new Date(t.reminder_time) >= new Date(Date.now() - 60 * 60 * 1000));

    const anchor = upcoming || withAI[0];
    if (!anchor) return null;

    const daysTo = anchor.reminder_time
      ? differenceInDays(parseISO(anchor.reminder_time), new Date())
      : null;

    return {
      title: "决策预加载",
      subtitle: daysTo != null ? (daysTo >= 0 ? `${daysTo}天后到期` : `已超期${Math.abs(daysTo)}天`) : "智能辅助",
      headline: anchor.ai_context_summary
        ? anchor.ai_context_summary
        : `即将到来：${anchor.title}`,
      payload_title: anchor.title,
      suggestions: (anchor.ai_analysis?.suggestions || []).slice(0, 4),
      context_note: anchor.ai_analysis?.priority_reasoning || anchor.ai_analysis?.time_reasoning || '',
      cta_link: `/Tasks?taskId=${anchor.id}`,
    };
  }, [active, dismissed.preload]);

  const cards = [
    geoCard && <GeoContextCard key="geo" card={geoCard} onSnooze={() => setDismissed((s) => ({ ...s, geo: true }))} />,
    forgetCard && <ForgettingRescueCard key="forget" card={forgetCard} onSnooze={() => setDismissed((s) => ({ ...s, forget: true }))} />,
    preloadCard && <DecisionPreloadCard key="preload" card={preloadCard} />,
  ].filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-md">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
            情境哨兵 <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </h3>
          <p className="text-xs text-slate-400">适时·适地·合适的方式，让你从容面对一切</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards}
      </div>
    </section>
  );
}