import React from "react";
import { CalendarRange, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const HORIZON_LABEL = {
  weekly: "周约定",
  monthly: "月约定",
  quarterly: "季度约定",
  yearly: "年度约定",
};

const HORIZON_COLOR = {
  weekly: "from-sky-400 to-blue-500",
  monthly: "from-violet-400 to-indigo-500",
  quarterly: "from-amber-400 to-orange-500",
  yearly: "from-emerald-400 to-teal-500",
};

/**
 * 长周期约定专属：紧凑型周期标签 + 总进度条 + 一句话摘要
 * 设计目标：替代"每天重复提醒"的视觉噪音，给出宏观感
 */
export default function LongTermProgressBar({ task, subtasks = [] }) {
  const horizon = task.planning_horizon;
  if (!horizon || horizon === "none") return null;

  const checkpoints = task?.long_term_plan?.checkpoints || [];
  const totalCps = checkpoints.length;
  const doneCps = checkpoints.filter((c) => c.status === "done").length;

  // 进度优先级：task.progress > checkpoint 完成比 > subtask 完成比
  let progress = 0;
  if (typeof task.progress === "number" && task.progress > 0) {
    progress = Math.min(100, Math.max(0, task.progress));
  } else if (totalCps > 0) {
    progress = Math.round((doneCps / totalCps) * 100);
  } else if (subtasks.length > 0) {
    const done = subtasks.filter((s) => s.status === "completed").length;
    progress = Math.round((done / subtasks.length) * 100);
  }

  const label = HORIZON_LABEL[horizon] || "长期约定";
  const gradient = HORIZON_COLOR[horizon] || "from-slate-400 to-slate-500";
  const summary = task.long_term_summary || task.description || "长周期推进中";

  return (
    <div className="mt-3 rounded-2xl px-3.5 py-2.5 bg-gradient-to-r from-slate-50 to-white border border-slate-100">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-white bg-gradient-to-r shadow-sm",
            gradient
          )}
        >
          <CalendarRange className="w-3 h-3" />
          {label}
        </span>
        {totalCps > 0 && (
          <span className="text-[11px] text-slate-500">
            {doneCps}/{totalCps} 节点
          </span>
        )}
        <span className="ml-auto text-xs font-bold text-slate-700 tabular-nums">
          {progress}%
        </span>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full bg-gradient-to-r transition-all duration-500", gradient)}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 简洁摘要（替代每日提醒的啰嗦内容） */}
      <p className="mt-2 text-[11.5px] text-slate-600 leading-snug line-clamp-2 flex items-start gap-1.5">
        <Sparkles className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
        <span>{summary}</span>
      </p>
    </div>
  );
}