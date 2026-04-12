import React, { useState } from "react";
import { format } from "date-fns";
import { 
  Clock, MapPin, Zap, Check, CheckCircle2, MoreHorizontal, 
  Sun, Repeat, Heart, AlertCircle, Package, Flag, Calendar,
  Navigation, ShoppingBag, Briefcase, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import AITaskAssistant from "./AITaskAssistant";

export default function TaskCard({ task, onComplete, onEdit }) {
  const [isCompleted, setIsCompleted] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  const handleComplete = (e) => {
    e.stopPropagation();
    setIsCompleted(true);
    // Delay actual completion to show animation
    setTimeout(() => {
      onComplete(task.id);
    }, 500);
  };

  // Helper to get category icon/color
  const getCategoryStyle = (category) => {
    switch (category) {
      case "work":
        return {
          border: "border-l-[#384877]",
          iconBg: "bg-[#384877]/10",
          iconColor: "text-[#384877]",
          lightBg: "bg-[#384877]/5",
          icon: "📝",
          label: "工作"
        };
      case "family":
        return {
          border: "border-l-rose-400",
          iconBg: "bg-rose-100",
          iconColor: "text-rose-600",
          lightBg: "bg-rose-50",
          icon: "👨‍👩‍👧",
          label: "家庭"
        };
      case "health":
        return {
          border: "border-l-emerald-400",
          iconBg: "bg-emerald-100",
          iconColor: "text-emerald-600",
          lightBg: "bg-emerald-50",
          icon: "🌱",
          label: "健康"
        };
      case "study":
        return {
          border: "border-l-indigo-400",
          iconBg: "bg-indigo-100",
          iconColor: "text-indigo-600",
          lightBg: "bg-indigo-50",
          icon: "📖",
          label: "学习"
        };
      case "shopping":
        return {
          border: "border-l-purple-400",
          iconBg: "bg-purple-100",
          iconColor: "text-purple-600",
          lightBg: "bg-purple-50",
          icon: "🛒",
          label: "购物"
        };
      case "finance":
        return {
          border: "border-l-amber-400",
          iconBg: "bg-amber-100",
          iconColor: "text-amber-600",
          lightBg: "bg-amber-50",
          icon: "💰",
          label: "财务"
        };
      default: // personal/other
        return {
          border: "border-l-green-400",
          iconBg: "bg-green-100",
          iconColor: "text-green-600",
          lightBg: "bg-green-50",
          icon: getSmartLifeIcon(task),
          label: "生活"
        };
    }
  };

  // Smart icon selection for personal/life tasks based on title keywords
  function getSmartLifeIcon(t) {
    const title = (t?.title || '').toLowerCase();
    if (/书|阅读|读|看书|图书/.test(title)) return '📚';
    if (/跑步|运动|健身|锻炼|瑜伽/.test(title)) return '🏃';
    if (/做饭|烹饪|煮|下厨|菜/.test(title)) return '🍳';
    if (/购物|买|超市|商场/.test(title)) return '🛍️';
    if (/打扫|清洁|卫生|洗|整理/.test(title)) return '🧹';
    if (/会议|开会|约见|见面/.test(title)) return '🤝';
    if (/旅行|出行|出发|机票|酒店/.test(title)) return '✈️';
    if (/电影|看剧|追剧|视频/.test(title)) return '🎬';
    if (/音乐|听歌|弹琴|唱/.test(title)) return '🎵';
    if (/睡|休息|午休|早起/.test(title)) return '😴';
    if (/喝水|水|咖啡|茶/.test(title)) return '☕';
    if (/药|吃药|医|体检/.test(title)) return '💊';
    if (/寄|快递|邮件|包裹|带/.test(title)) return '📦';
    if (/电话|打电话|联系|沟通/.test(title)) return '📞';
    if (/写|笔记|日记/.test(title)) return '✍️';
    if (/遛狗|宠物|猫|狗/.test(title)) return '🐾';
    if (/浇花|植物|花/.test(title)) return '🌸';
    return '⚡';
  }

  const style = getCategoryStyle(task.category);
  
  // Parse context for display
  const hasLocationContext = task.location_context || (task.context_type === 'location');
  const hasTimeContext = task.time_context || (task.context_type === 'time');
  const hasSmartTrigger = task.ai_suggested_trigger;

  return (
    <div 
      className={cn(
        "bg-white rounded-xl md:rounded-2xl p-3.5 md:p-5 shadow-sm border border-slate-100 relative overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]",
        "border-l-[3px]", 
        style.border,
        isCompleted && "opacity-0 scale-95"
      )}
      onClick={() => onEdit(task)}
    >
      {/* Background decoration for location tasks */}
      {hasLocationContext && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full blur-2xl -mr-16 -mt-16 opacity-50 pointer-events-none"></div>
      )}

      {/* Header Chips */}
      <div className="flex items-start justify-between mb-3 relative z-10">
        <div className="flex flex-wrap items-center gap-2">
          {hasLocationContext ? (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-lg font-medium flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              地点触发
            </span>
          ) : hasTimeContext ? (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-lg font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {task.time_context?.natural_language_phrase || "时间触发"}
            </span>
          ) : (
            <span className={cn("px-2 py-1 text-xs rounded-lg font-medium flex items-center gap-1", style.iconBg, style.iconColor)}>
              <Zap className="w-3 h-3" />
              {style.label}
            </span>
          )}
          
          {task.repeat_rule && task.repeat_rule !== 'none' && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg font-medium flex items-center gap-1">
              <Repeat className="w-3 h-3" />
              {task.repeat_rule === 'daily' ? '每天' : '重复'}
            </span>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600 -mr-2">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(task); }}>编辑</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">删除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main Content */}
      <div className="flex gap-3 md:gap-4 relative z-10">
        {/* Icon Box */}
        <div className="flex-shrink-0">
          <div className={cn(
            "w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-2xl bg-gradient-to-br",
            task.category === 'work' ? "from-[#384877]/20 to-[#384877]/5" :
            task.category === 'health' ? "from-emerald-100 to-emerald-50" :
            task.category === 'love' ? "from-rose-100 to-rose-50" :
            task.category === 'shopping' ? "from-purple-100 to-purple-50" :
            "from-green-100 to-green-50"
          )}>
            {style.icon}
          </div>
        </div>

        {/* Text Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 mb-0.5 md:mb-1 truncate text-sm md:text-base">{task.title}</h3>
          {task.description && (
            <p className="text-sm text-slate-500 mb-2 line-clamp-1">{task.description}</p>
          )}

          {/* Context Details */}
          <div className="flex flex-wrap items-center gap-3 text-xs mt-1">
            {hasLocationContext && (
              <>
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin className="w-3 h-3" />
                  {task.location_context?.name || "特定地点"}
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {task.location_context?.trigger_on === 'exit' ? '离开触发' : '到达触发'}
                </span>
              </>
            )}

            {hasTimeContext && !hasLocationContext && (
              <span className="flex items-center gap-1 text-slate-400">
                <Clock className="w-3 h-3" />
                {task.reminder_time ? format(new Date(task.reminder_time), "HH:mm") : "全天"}
              </span>
            )}
            
            {/* Custom tags/stats if any */}
            {task.days_streak > 0 && (
              <>
                 <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                 <span className="text-rose-600 font-medium flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    已坚持 {task.days_streak} 天
                 </span>
              </>
            )}
          </div>
        </div>

        {/* Check Button */}
        <div className="flex flex-col items-end gap-1.5 md:gap-2">
          <button 
            onClick={handleComplete}
            className="w-9 h-9 md:w-10 md:h-10 rounded-full border-2 border-slate-200 flex items-center justify-center hover:border-green-500 hover:bg-green-50 transition-all group active:scale-90 touch-manipulation no-min-size shrink-0"
          >
            <Check className="w-4 h-4 md:w-5 md:h-5 text-slate-300 group-hover:text-green-600" />
          </button>
          
          <span className={cn(
            "text-xs font-medium",
            task.is_overdue ? "text-red-500" : "text-slate-400"
          )}>
            {task.is_overdue ? "已逾期" : 
             task.due_date_label || "今天"}
          </span>
        </div>
      </div>

      {/* Smart Suggestions / AI Footer */}
      {hasSmartTrigger && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>{hasSmartTrigger.reasoning || "建议在合适时机提醒"}</span>
          </div>
          <button 
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
            onClick={(e) => { e.stopPropagation(); /* handle snooze */ }}
          >
            <Clock className="w-3 h-3" />
            推迟
          </button>
        </div>
      )}

      {/* AI Assistant Section */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <AITaskAssistant 
          task={task} 
          onApplySuggestion={(type, data) => {
            // Handle applying AI suggestions
            if (type === 'priority' && onEdit) {
              onEdit({ ...task, priority: data });
            }
          }}
        />
      </div>
    </div>
  );
}