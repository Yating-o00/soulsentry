import React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, RotateCcw, Zap, CalendarIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

export default function DayPlanHeader({ 
  dayPlan, 
  currentDate, 
  userInput, 
  onShowAppend, 
  onDelete, 
  onReplan 
}) {
  const dayStr = format(currentDate, 'M月d日', { locale: zhCN });
  const weekDay = format(currentDate, 'EEEE', { locale: zhCN });
  const theme = dayPlan?.theme || dayPlan?.plan_json?.theme || '';
  const summary = dayPlan?.summary || dayPlan?.plan_json?.summary || '';
  const stats = dayPlan?.plan_json?.stats || {};
  const displayInput = dayPlan?.original_input || userInput || '';

  return (
    <div className="space-y-4">
      {/* Title Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-2xl font-bold text-slate-900">已为你安排</h3>
            {theme && (
              <span className="px-3 py-1 bg-[#384877]/10 text-[#384877] text-xs font-medium rounded-full">
                {theme}
              </span>
            )}
          </div>
          {displayInput && (
            <p className="text-sm text-slate-500">
              基于输入: "{displayInput.length > 40 ? displayInput.substring(0, 40) + '...' : displayInput}"
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-slate-600 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            {dayStr} {weekDay}
          </span>
          <Button
            size="sm"
            className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl"
            onClick={onShowAppend}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> 追加内容
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="rounded-xl border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600"
          >
            删除规划
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReplan}
            className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#384877]"
          >
            重新规划
          </Button>
        </div>
      </div>

      {/* Summary + Stats Cards (like week planner) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Summary Card */}
        <div className="md:col-span-2 bg-[#384877] rounded-[24px] p-6 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Sparkles className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <div className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">今日摘要</div>
            <p className="text-lg font-medium leading-relaxed opacity-95">
              {summary || '暂无摘要'}
            </p>
          </div>
        </div>

        {/* Stat: Focus Hours */}
        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2">
            <Zap className="w-5 h-5" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{stats.focus_hours || 0}h</div>
          <div className="text-xs text-slate-400 font-medium">深度专注</div>
        </div>

        {/* Stat: Tasks */}
        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{stats.tasks_count || 0}</div>
          <div className="text-xs text-slate-400 font-medium">关键任务</div>
        </div>
      </div>
    </div>
  );
}