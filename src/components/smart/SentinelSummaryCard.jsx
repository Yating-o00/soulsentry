import React from "react";
import { Shield, Clock, MapPin, HelpCircle, AlertTriangle, Lightbulb } from "lucide-react";
import SentinelBadge from "./SentinelBadge";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

/**
 * 将 Task 上的哨兵分析字段渲染为"合适时间/地点/方式"的上下文卡片。
 * 在 ExecutionItem 展开面板、Task 详情、Dashboard 等处复用。
 */
export default function SentinelSummaryCard({ task, compact = false }) {
  if (!task) return null;
  const hasData = task.ai_context_summary
    || task.interruption_level
    || task.optimal_reminder_time
    || task.ai_analysis?.best_location;
  if (!hasData) return null;

  const risks = task.ai_analysis?.risks || [];
  const suggestions = task.ai_analysis?.suggestions || [];
  const bestLocation = task.ai_analysis?.best_location;
  const timeReason = task.ai_analysis?.time_reasoning;

  const formatTime = (iso) => {
    if (!iso) return null;
    try { return format(new Date(iso), "MM-dd HH:mm", { locale: zhCN }); }
    catch { return iso; }
  };

  return (
    <div className="p-3 rounded-xl bg-gradient-to-br from-[#384877]/[0.04] to-[#3b5aa2]/[0.04] border border-[#384877]/10 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#384877]" />
          <span className="text-xs font-semibold text-[#384877]">情境哨兵</span>
        </div>
        <SentinelBadge level={task.interruption_level} score={task.interruption_score} />
      </div>

      {task.ai_context_summary && (
        <p className="text-xs text-slate-700 leading-relaxed">{task.ai_context_summary}</p>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
        {task.optimal_reminder_time && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/70 border border-slate-200">
            <Clock className="w-3 h-3 text-blue-500" />
            时机：{formatTime(task.optimal_reminder_time)}
          </span>
        )}
        {bestLocation && bestLocation !== "任意" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/70 border border-slate-200">
            <MapPin className="w-3 h-3 text-emerald-500" />
            地点：{bestLocation}
          </span>
        )}
        {task.is_waiting_for_reply && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">
            <HelpCircle className="w-3 h-3" />
            等待：{task.waiting_for || "回复"}
          </span>
        )}
        {task.forgetting_risk === "high" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700">
            <AlertTriangle className="w-3 h-3" />
            易遗忘
          </span>
        )}
      </div>

      {!compact && timeReason && (
        <p className="text-[11px] text-slate-500 italic">· {timeReason}</p>
      )}

      {!compact && (risks.length > 0 || suggestions.length > 0) && (
        <div className="pt-2 border-t border-[#384877]/10 space-y-1.5">
          {risks.slice(0, 2).map((r, i) => (
            <div key={`r-${i}`} className="flex items-start gap-1.5 text-[11px] text-rose-600">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{r}</span>
            </div>
          ))}
          {suggestions.slice(0, 2).map((s, i) => (
            <div key={`s-${i}`} className="flex items-start gap-1.5 text-[11px] text-emerald-700">
              <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}