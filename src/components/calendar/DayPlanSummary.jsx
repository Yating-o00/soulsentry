import React, { useState } from "react";
import { Clock, CheckCircle2, Target, Sparkles, ListTodo, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
};

const TYPE_LABELS = {
  focus: { label: "专注", color: "text-purple-600 bg-purple-50 border-purple-200" },
  meeting: { label: "会议", color: "text-amber-600 bg-amber-50 border-amber-200" },
  travel: { label: "差旅", color: "text-blue-600 bg-blue-50 border-blue-200" },
  rest: { label: "休息", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  work: { label: "工作", color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  other: { label: "事项", color: "text-slate-500 bg-slate-50 border-slate-200" },
};

export default function DayPlanSummary({ dayPlan, isLoading }) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="flex gap-3 animate-pulse">
        <div className="h-8 bg-slate-100 rounded-lg flex-1" />
        <div className="h-8 bg-slate-100 rounded-lg flex-1" />
      </div>
    );
  }

  if (!dayPlan) {
    return (
      <div className="rounded-xl p-4 bg-slate-50/60 border border-dashed border-slate-200 text-center">
        <Sparkles className="w-4 h-4 text-slate-300 mx-auto mb-1.5" />
        <p className="text-xs text-slate-400">暂无当日 AI 规划 · 在上方输入安排即可生成</p>
      </div>
    );
  }

  const focusBlocks = dayPlan.plan_json?.focus_blocks || [];
  const keyTasks = dayPlan.plan_json?.key_tasks || [];
  const completedCount = keyTasks.filter(t => t.status === "completed").length;
  const totalTasks = keyTasks.length;
  const hasContent = focusBlocks.length > 0 || totalTasks > 0;

  if (!hasContent) return null;

  // Show first 3 by default, expand to show all
  const PREVIEW_COUNT = 3;
  const visibleBlocks = expanded ? focusBlocks : focusBlocks.slice(0, PREVIEW_COUNT);
  const hasMore = focusBlocks.length > PREVIEW_COUNT;

  return (
    <div className="space-y-3">
      {/* Compact stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        {dayPlan.theme && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#384877]/5 border border-[#384877]/10 text-[11px] font-medium text-[#384877]">
            <Target className="w-3 h-3" /> {dayPlan.theme}
          </span>
        )}
        {focusBlocks.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 border border-purple-100 text-[11px] font-medium text-purple-600">
            <Zap className="w-3 h-3" /> {focusBlocks.length} 时段
          </span>
        )}
        {totalTasks > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-[11px] font-medium text-blue-600">
            <ListTodo className="w-3 h-3" /> {completedCount}/{totalTasks}
          </span>
        )}
      </div>

      {/* Focus blocks — compact inline list */}
      {focusBlocks.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
          <div className="px-3 py-2 bg-slate-50/50 border-b border-slate-100 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-purple-500" />
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">专注时段</span>
          </div>
          <div className="divide-y divide-slate-50">
            {visibleBlocks.map((block, i) => {
              const typeInfo = TYPE_LABELS[block.type] || TYPE_LABELS.other;
              return (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50/50 transition-colors">
                  <span className="text-[11px] font-mono font-semibold text-slate-400 w-11 shrink-0">
                    {block.time || "--:--"}
                  </span>
                  <span className="text-sm text-slate-800 font-medium truncate flex-1">{block.title}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0", typeInfo.color)}>
                    {typeInfo.label}
                  </span>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              {expanded ? <><ChevronUp className="w-3 h-3" /> 收起</> : <><ChevronDown className="w-3 h-3" /> 展开全部 ({focusBlocks.length - PREVIEW_COUNT} 更多)</>}
            </button>
          )}
        </div>
      )}

      {/* Key tasks — minimal */}
      {totalTasks > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
          <div className="px-3 py-2 bg-slate-50/50 border-b border-slate-100 flex items-center gap-1.5">
            <ListTodo className="w-3 h-3 text-blue-500" />
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">关键任务</span>
          </div>
          <div className="divide-y divide-slate-50">
            {keyTasks.map((task, i) => {
              const isCompleted = task.status === "completed";
              return (
                <div key={i} className={cn(
                  "flex items-center gap-2.5 px-3 py-2 transition-colors",
                  isCompleted ? "opacity-50" : "hover:bg-slate-50/50"
                )}>
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    isCompleted ? "bg-emerald-500" : PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium
                  )} />
                  <span className={cn(
                    "text-sm flex-1 min-w-0 truncate",
                    isCompleted ? "line-through text-slate-400" : "text-slate-700"
                  )}>
                    {task.title}
                  </span>
                  {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}