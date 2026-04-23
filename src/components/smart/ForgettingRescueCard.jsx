import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

/**
 * 遗忘拯救卡片 —— 基于任务的 forgetting_risk / 超期天数触发
 * 视觉对齐产品语言：紫色智能干预色调
 */
export default function ForgettingRescueCard({ card, onSnooze }) {
  const navigate = useNavigate();
  if (!card) return null;

  return (
    <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">{card.title || "遗忘拯救"}</div>
            <div className="text-xs text-slate-500 mt-0.5">{card.subtitle || "基于遗忘曲线预警"}</div>
          </div>
        </div>
        <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">
          智能干预
        </span>
      </div>

      <div className="rounded-xl bg-purple-50/60 p-4 mb-4">
        <div className="text-sm font-semibold text-slate-900 mb-1">
          {card.headline}
        </div>
        {card.risk_note && (
          <div className="text-xs text-purple-700/80 mb-3">{card.risk_note}</div>
        )}
        {card.context_note && (
          <div className="rounded-lg bg-white border border-purple-100 p-3">
            <div className="text-[11px] text-slate-400 mb-1">上下文：</div>
            <div className="text-sm text-slate-700 leading-relaxed">{card.context_note}</div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 bg-purple-600 hover:bg-purple-700"
          onClick={() => navigate(card.cta_link || '/Tasks')}
        >
          立即处理
        </Button>
        <Button variant="outline" onClick={onSnooze}>延后</Button>
      </div>
    </div>
  );
}