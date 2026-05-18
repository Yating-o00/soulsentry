import React from "react";
import { Target, CalendarRange, Calendar, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const HORIZON_META = {
  weekly:    { label: "周约定",   icon: Calendar,      className: "bg-sky-50 text-sky-700 border-sky-100" },
  monthly:   { label: "月约定",   icon: CalendarDays,  className: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  quarterly: { label: "季度约定", icon: CalendarRange, className: "bg-violet-50 text-violet-700 border-violet-100" },
  yearly:    { label: "年度约定", icon: Target,        className: "bg-amber-50 text-amber-700 border-amber-100" },
};

/**
 * 长周期约定徽章 + 总进度条
 * @param {Object} task        - 父任务
 * @param {Array}  subtasks    - 该任务的子任务（里程碑）
 */
export default function HorizonProgressBadge({ task, subtasks = [] }) {
  const horizon = task?.planning_horizon;
  if (!horizon || horizon === "none") return null;

  const meta = HORIZON_META[horizon] || HORIZON_META.weekly;
  const Icon = meta.icon;

  // 总进度：优先用子任务完成比例；无子任务时回退到 task.progress
  let progress = Number(task.progress || 0);
  let doneCount = 0;
  const totalCount = subtasks.length;
  if (totalCount > 0) {
    doneCount = subtasks.filter(s => s.status === "completed").length;
    progress = Math.round((doneCount / totalCount) * 100);
  }
  progress = Math.max(0, Math.min(100, progress));

  return (
    <div className="mt-2 rounded-xl border border-stone-100 bg-gradient-to-r from-stone-50/80 to-white px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md font-medium border",
            meta.className
          )}>
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
          {task.horizon_summary && (
            <span className="text-[11px] text-stone-500 truncate">
              {task.horizon_summary}
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold text-stone-700 flex-shrink-0">
          {totalCount > 0 ? `${doneCount}/${totalCount} · ${progress}%` : `${progress}%`}
        </span>
      </div>
      <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#384877] to-[#3b5aa2] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}