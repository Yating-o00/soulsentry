import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import CovenantStamp from "./CovenantStamp";
import DeferReasonSheet from "./DeferReasonSheet";
import { Scissors, Clock } from "lucide-react";
import { toast } from "sonner";

// 约定卡片外壳：逾期朱砂虚线框 + 温柔出口 + 完成时盖下「如约」印章
export default function AgreementCardShell({ task, onComplete, children }) {
  const [stamping, setStamping] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [downgrading, setDowngrading] = useState(false);
  const queryClient = useQueryClient();

  const dueRef = task.snooze_until || task.end_time || task.reminder_time;
  const isOverdue =
    task.status !== "completed" && !!dueRef && new Date(dueRef).getTime() < Date.now();

  const handleComplete = (t, checked) => {
    if (!checked) {
      onComplete && onComplete(t, false);
      return;
    }
    setStamping(true);
    setTimeout(() => {
      setStamping(false);
      onComplete && onComplete(t, true);
      queryClient.invalidateQueries({ queryKey: ["evolution-stats"] });
    }, 1100);
  };

  const downgrade = async () => {
    setDowngrading(true);
    try {
      await base44.entities.Task.create({
        title: `先做 10 分钟：${task.title}`,
        description: "从约定里切出的一小步，做完这一步就算今天没有失约。",
        parent_task_id: task.id,
        status: "pending",
        category: task.category,
        priority: "low",
        reminder_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("已切成一小步，先做 10 分钟就好");
    } catch (_) {
      toast.error("拆分失败，请重试");
    } finally {
      setDowngrading(false);
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "relative rounded-2xl transition-all",
          isOverdue && "border-2 border-dashed border-[#B23A2F]/55 p-1 bg-[#B23A2F]/[0.03]"
        )}
      >
        {children({ handleComplete })}
        {stamping && <CovenantStamp />}
      </div>

      {isOverdue && (
        <div className="mt-2 px-3 py-2.5 rounded-xl bg-[#B23A2F]/[0.05] border border-[#B23A2F]/20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#B23A2F]">这条约定过时了，不必自责。</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downgrade();
              }}
              disabled={downgrading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#B23A2F]/30 text-[11px] text-[#B23A2F] hover:bg-[#B23A2F]/5 transition-colors disabled:opacity-50"
            >
              <Scissors className="w-3 h-3" /> 降级为微任务
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowReasons((v) => !v);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600 hover:border-slate-300 transition-colors"
            >
              <Clock className="w-3 h-3" /> 顺延并说明原因
            </button>
          </div>
          {showReasons && <DeferReasonSheet task={task} onDone={() => setShowReasons(false)} />}
        </div>
      )}
    </div>
  );
}