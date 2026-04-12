import React from "react";
import { Clock, CheckCircle2, Target, Sparkles, ListTodo, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
};

const TYPE_LABELS = {
  focus: { label: "专注", color: "bg-purple-100 text-purple-700" },
  meeting: { label: "会议", color: "bg-amber-100 text-amber-700" },
  travel: { label: "差旅", color: "bg-blue-100 text-blue-700" },
  rest: { label: "休息", color: "bg-emerald-100 text-emerald-700" },
  work: { label: "工作", color: "bg-indigo-100 text-indigo-700" },
  other: { label: "事项", color: "bg-slate-100 text-slate-600" },
};

function FocusBlockCard({ block }) {
  const typeInfo = TYPE_LABELS[block.type] || TYPE_LABELS.other;
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition-colors">
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[11px] font-mono font-semibold text-slate-500 leading-none">
          {block.time || "--:--"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h5 className="text-sm font-semibold text-slate-800 truncate">{block.title}</h5>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0", typeInfo.color)}>
            {typeInfo.label}
          </span>
        </div>
        {block.description && (
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{block.description}</p>
        )}
      </div>
    </div>
  );
}

function TaskItem({ task }) {
  const isCompleted = task.status === "completed";
  return (
    <div className={cn(
      "flex items-center gap-3 p-2.5 rounded-xl transition-colors",
      isCompleted ? "opacity-60" : "hover:bg-slate-50"
    )}>
      <div className={cn(
        "w-2 h-2 rounded-full shrink-0",
        isCompleted ? "bg-emerald-500" : PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium
      )} />
      <span className={cn(
        "text-sm flex-1 min-w-0 truncate",
        isCompleted ? "line-through text-slate-400" : "text-slate-700"
      )}>
        {task.title}
      </span>
      {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
    </div>
  );
}

export default function DayPlanSummary({ dayPlan, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-1/4" />
        <div className="h-16 bg-slate-50 rounded-xl" />
        <div className="h-16 bg-slate-50 rounded-xl" />
      </div>
    );
  }

  if (!dayPlan) {
    return (
      <div className="rounded-2xl p-5 bg-slate-50/60 border border-dashed border-slate-200 text-center">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
          <Sparkles className="w-5 h-5 text-slate-300" />
        </div>
        <p className="text-sm text-slate-400">暂无当日 AI 规划</p>
        <p className="text-xs text-slate-300 mt-1">在上方输入安排，AI 会自动生成协同方案</p>
      </div>
    );
  }

  const focusBlocks = dayPlan.plan_json?.focus_blocks || [];
  const keyTasks = dayPlan.plan_json?.key_tasks || [];
  const completedCount = keyTasks.filter(t => t.status === "completed").length;
  const totalTasks = keyTasks.length;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {(focusBlocks.length > 0 || totalTasks > 0) && (
        <div className="flex items-center gap-3 flex-wrap">
          {focusBlocks.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-100">
              <Zap className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs font-medium text-purple-700">{focusBlocks.length} 个时间块</span>
            </div>
          )}
          {totalTasks > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
              <ListTodo className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-medium text-blue-700">
                {completedCount}/{totalTasks} 任务
              </span>
            </div>
          )}
          {dayPlan.theme && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#384877]/5 border border-[#384877]/10">
              <Target className="w-3.5 h-3.5 text-[#384877]" />
              <span className="text-xs font-medium text-[#384877]">{dayPlan.theme}</span>
            </div>
          )}
        </div>
      )}

      {/* Focus blocks */}
      {focusBlocks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> 专注时段
          </h4>
          <div className="space-y-2">
            {focusBlocks.map((block, i) => (
              <FocusBlockCard key={i} block={block} />
            ))}
          </div>
        </div>
      )}

      {/* Key tasks */}
      {totalTasks > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ListTodo className="w-3.5 h-3.5" /> 关键任务
          </h4>
          <div className="rounded-xl border border-slate-100 bg-white divide-y divide-slate-50">
            {keyTasks.map((task, i) => (
              <TaskItem key={i} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}