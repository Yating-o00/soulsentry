import React from "react";
import { Navigation, MapPin, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 顺路提醒卡片 - 浮层样式（图片设计还原）
 */
export default function OnTheWayReminderCard({ match, onConfirm, onSnooze, onDismiss }) {
  if (!match) return null;

  const distanceText = match.distance_m >= 1000
    ? `${(match.distance_m / 1000).toFixed(1)} 公里`
    : `${match.distance_m} 米`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/10 w-full max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
          <Navigation className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="font-bold text-slate-900 text-base leading-tight mb-1">
            {match.title}
          </div>
          <div className="text-sm text-slate-500 leading-snug">
            {match.subtitle}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="inline-flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg mb-4 font-medium">
        <MapPin className="w-3.5 h-3.5" />
        距离 {distanceText} · 顺路 {match.walking_minutes} 分钟
      </div>

      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-colors"
        >
          记住了
        </button>
        <button
          onClick={onSnooze}
          className="flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-4 py-3 rounded-xl transition-colors"
        >
          <Clock className="w-4 h-4" />
          稍后
        </button>
      </div>
    </div>
  );
}