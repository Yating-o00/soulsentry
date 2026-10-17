import React from "react";
import { CheckCircle2, Clock, Feather } from "lucide-react";
import { useReminderActions } from "@/components/notifications/useReminderActions";
import { suggestSnoozeMinutes } from "@/lib/reminderActions";

/**
 * 行内紧凑版三动作（立即处理/延后/轻轻放下），用于列表行、守护卡片等
 * 空间有限的提醒面。延后直接应用按约定内容推荐的档位。
 */
export default function TaskQuickActions({ task, onAction, size = "sm" }) {
  const { complete, snooze, dismiss, isPending } = useReminderActions(task, { onAction });
  const suggestion = suggestSnoozeMinutes(task);
  const base =
    size === "xs"
      ? "h-6 px-1.5 text-[10.5px]"
      : "h-7 px-2 text-[11px]";
  const iconCls = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        onClick={complete}
        disabled={isPending}
        title="立即处理（打卡履约）"
        className={`inline-flex items-center gap-0.5 rounded-full bg-emerald-500 text-white font-medium transition-opacity hover:opacity-85 disabled:opacity-50 ${base}`}
      >
        <CheckCircle2 className={iconCls} />
        处理
      </button>
      <button
        onClick={() => snooze(suggestion.minutes)}
        disabled={isPending}
        title={`延后：${suggestion.reason}`}
        className={`inline-flex items-center gap-0.5 rounded-full border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 ${base}`}
      >
        <Clock className={iconCls} />
        {suggestion.minutes}分
      </button>
      <button
        onClick={dismiss}
        disabled={isPending}
        title="轻轻放下：本周期不再提醒"
        className={`inline-flex items-center gap-0.5 rounded-full text-slate-400 transition-colors hover:text-slate-600 hover:bg-slate-50 disabled:opacity-50 ${base}`}
      >
        <Feather className={iconCls} />
        放下
      </button>
    </div>
  );
}
