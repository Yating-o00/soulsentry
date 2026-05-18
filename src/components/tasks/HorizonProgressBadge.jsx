import React from "react";
import { Target, CalendarRange, Calendar, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const HORIZON_META = {
  weekly:    { label: "周约定",   icon: Calendar,      className: "bg-sky-50 text-sky-700 border-sky-100" },
  monthly:   { label: "月约定",   icon: CalendarDays,  className: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  quarterly: { label: "季度约定", icon: CalendarRange, className: "bg-violet-50 text-violet-700 border-violet-100" },
  yearly:    { label: "年度约定", icon: Target,        className: "bg-amber-50 text-amber-700 border-amber-100" },
};

// 根据截止/提醒时间距今天数自动推断周期
function inferHorizon(task) {
  // 已显式设置则尊重用户设置
  if (task.planning_horizon && task.planning_horizon !== "none") {
    return task.planning_horizon;
  }
  const targetStr = task.end_time || task.reminder_time;
  if (!targetStr) return null;
  const target = new Date(targetStr);
  if (isNaN(target.getTime())) return null;
  const diffDays = (target.getTime() - Date.now()) / 86400000;
  // 只对未来的长期任务生效
  if (diffDays < 7) return null;          // 一周以内：普通任务，不显示
  if (diffDays <= 31) return "weekly";    // 一周~一月：周约定
  if (diffDays <= 95) return "monthly";   // 一月~三月：月约定
  if (diffDays <= 200) return "quarterly";// 三月~半年多：季度约定
  return "yearly";                         // 半年以上：年度约定
}

/**
 * 长周期约定徽章 + 总进度条
 * 截止日期超过一周的任务自动显示（不强制要求设置 planning_horizon）
 */
export default function HorizonProgressBadge({ task, subtasks = [] }) {
  const horizon = inferHorizon(task);
  if (!horizon) return null;

  const meta = HORIZON_META[horizon];
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

  // 简洁摘要：优先用 AI 摘要，否则用 ai_analysis.suggestions[0]，再回退到描述
  const summary = task.long_term_summary
    || task.horizon_summary
    || task.ai_analysis?.suggestions?.[0]
    || task.description
    || "";

  return (
    <div className="mt-2 rounded-xl border border-stone-100 bg-gradient-to-r from-stone-50/80 to-white px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md font-medium border flex-shrink-0",
            meta.className
          )}>
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
          {summary && (
            <span className="text-[11px] text-stone-500 truncate">
              {summary}
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