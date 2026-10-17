import React, { useEffect, useState } from "react";
import { Bell, CheckCircle2, Clock, Feather, MapPin, Sparkles, X } from "lucide-react";
import { useReminderActions } from "@/components/notifications/useReminderActions";
import {
  getCurrentPositionCached,
  haversineMeters,
  formatDistance,
  suggestSnoozeMinutes,
} from "@/lib/reminderActions";

/**
 * 可点击的约定提醒小组件：立即处理 / 延后 / 轻轻放下。
 * - 立即处理：相当于打卡履约（status=completed，重复约定由后端按打卡语义推进）
 * - 延后：15/30/60 分钟三档，按约定内容智能推荐一档
 * - 轻轻放下：本周期内所有提醒静默（后端 gentle_dismiss 归一化，全链路 cron 尊重）
 * - 与位置关联高的约定（location_reminder）：显示与目标地点的实时距离
 */
export default function ReminderActionCard({
  task,
  title,
  body,
  onAction,
  onClose,
  distanceText = null,
  compact = false,
}) {
  const [computedDistance, setComputedDistance] = useState(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const suggestion = suggestSnoozeMinutes(task);
  const { complete, snooze, dismiss, isPending } = useReminderActions(task, { onAction });

  const loc = task?.location_reminder;
  useEffect(() => {
    const lat = Number(loc?.latitude);
    const lng = Number(loc?.longitude);
    if (distanceText || !loc?.enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let alive = true;
    getCurrentPositionCached().then((pos) => {
      if (!alive || !pos) return;
      const meters = haversineMeters(pos, { latitude: lat, longitude: lng });
      const dText = formatDistance(meters);
      if (dText) {
        setComputedDistance(
          loc.location_name
            ? `距「${loc.location_name}」${dText}${meters <= (loc.radius || 200) ? "，已到附近" : ""}`
            : dText
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [distanceText, loc?.enabled, loc?.latitude, loc?.longitude, loc?.location_name, loc?.radius]);

  const snoozeOptions = [15, 30, 60];

  return (
    <div
      className={`relative bg-white rounded-xl shadow-2xl border-2 border-purple-200 ${
        compact ? "p-3" : "p-4"
      } min-w-[300px] max-w-[380px]`}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-slate-300 hover:text-slate-500 transition-colors"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-800 mb-1">{title || task?.title}</h4>
          {body && <p className="text-sm text-slate-600 mb-2">{body}</p>}
          {distanceText ? (
            <p className="text-xs text-blue-600 flex items-center gap-1 mb-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {distanceText}
            </p>
          ) : computedDistance ? (
            <p className="text-xs text-blue-600 flex items-center gap-1 mb-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {computedDistance}
            </p>
          ) : null}

          {snoozeOpen ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {snoozeOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => snooze(m)}
                  disabled={isPending}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                    m === suggestion.minutes
                      ? "bg-purple-50 border-purple-300 text-purple-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m === suggestion.minutes && (
                    <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />
                  )}
                  {m} 分钟{m === suggestion.minutes ? " · 推荐" : ""}
                </button>
              ))}
              <button
                onClick={() => setSnoozeOpen(false)}
                className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-600"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={complete}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                立即处理
              </button>
              <button
                onClick={() => setSnoozeOpen(true)}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                title={suggestion.reason}
              >
                <Clock className="w-3.5 h-3.5" />
                延后
              </button>
              <button
                onClick={dismiss}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <Feather className="w-3.5 h-3.5" />
                轻轻放下
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
