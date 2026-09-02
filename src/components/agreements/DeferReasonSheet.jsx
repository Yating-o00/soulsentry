import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { REASON_LABELS } from "@/hooks/useEvolutionStats";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// 顺延不是失败：选一个原因，心栈据此校准你的时间估算
export default function DeferReasonSheet({ task, onDone }) {
  const [busy, setBusy] = useState(null);
  const queryClient = useQueryClient();

  const pick = async (key) => {
    setBusy(key);
    const base = task.reminder_time ? new Date(task.reminder_time) : new Date();
    const deferredTo = new Date(Math.max(base.getTime(), Date.now()) + 24 * 60 * 60 * 1000).toISOString();
    try {
      await base44.entities.TaskDeferralLog.create({
        task_id: task.id,
        task_title: task.title,
        original_time: task.reminder_time || undefined,
        deferred_to: deferredTo,
        reason_category: key,
      });
      await base44.entities.Task.update(task.id, {
        reminder_time: deferredTo,
        status: "snoozed",
        snooze_until: deferredTo,
        snooze_count: (task.snooze_count || 0) + 1,
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["evolution-stats"] });
      toast.success("顺延不是失败，心栈会据此校准你的时间估算");
      onDone && onDone();
    } catch (_) {
      toast.error("记录失败，请重试");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(REASON_LABELS).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            pick(key);
          }}
          disabled={!!busy}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600 hover:border-[#6B8E23]/50 hover:text-[#4d6619] transition-colors disabled:opacity-50"
        >
          {busy === key && <Loader2 className="w-3 h-3 animate-spin" />}
          {label}
        </button>
      ))}
    </div>
  );
}