import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, Clock, MapPin, Repeat, MoreHorizontal, 
  ShoppingBag, Zap, Navigation, 
  Briefcase, Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function LifeTaskCard({ 
  task, 
  onComplete, 
  onEdit 
}) {
  const [completed, setCompleted] = useState(task.status === 'completed');

  const handleComplete = (e) => {
    e.stopPropagation();
    setCompleted(!completed);
    onComplete(task, !completed);
  };

  const getTheme = () => {
    switch(task.category) {
      case 'work': return {
        color: 'blue',
        icon: <Briefcase className="w-5 h-5" />,
        emoji: '📝',
        gradient: 'from-blue-100 to-blue-50',
        bg: 'bg-blue-50',
        text: 'text-blue-700'
      };
      case 'health': return {
        color: 'rose',
        icon: <Heart className="w-5 h-5" />,
        emoji: '🌱',
        gradient: 'from-rose-100 to-rose-50',
        bg: 'bg-rose-50',
        text: 'text-rose-700'
      };
      case 'family': return {
        color: 'purple',
        icon: <Heart className="w-5 h-5" />,
        emoji: '👨‍👩‍👧‍👦',
        gradient: 'from-purple-100 to-purple-50',
        bg: 'bg-purple-50',
        text: 'text-purple-700'
      };
      case 'shopping': return {
        color: 'purple',
        icon: <ShoppingBag className="w-5 h-5" />,
        emoji: '📦',
        gradient: 'from-purple-100 to-purple-50',
        bg: 'bg-purple-50',
        text: 'text-purple-700'
      };
      default: return {
        color: 'green',
        icon: <Check className="w-5 h-5" />,
        emoji: '📝',
        gradient: 'from-green-100 to-green-50',
        bg: 'bg-stone-50',
        text: 'text-stone-700'
      };
    }
  };

  const theme = getTheme();
  
  const getTimeText = () => {
    if (!task.reminder_time) return "今天";
    const date = new Date(task.reminder_time);
    const now = new Date();
    const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "已过期";
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "明天";
    if (diffDays === 2) return "后天";
    return `${diffDays}天后`;
  };

  const triggerType = task.location_reminder?.enabled ? 'location' : (task.repeat_rule !== 'none' ? 'repeat' : 'time');

  const categoryLabel = task.category === 'work' ? '工作' : 
                       task.category === 'health' ? '健康' : 
                       task.category === 'shopping' ? '购物' : '生活';

  return (
    <div 
      onClick={(e) => {
        if (e.target.closest('button')) return;
        onEdit && onEdit();
      }}
      className={cn(
        "task-card group bg-white rounded-2xl p-5 shadow-sm border border-stone-100 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
        task.category === 'work' ? 'border-l-[3px] border-l-blue-400' : 
        task.category === 'health' ? 'border-l-[3px] border-l-rose-400' :
        'border-l-[3px] border-l-green-400',
        completed && "opacity-60"
      )}
    >
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-16 -mt-16 opacity-30 pointer-events-none",
        `bg-${theme.color}-100`
      )} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {task.location_reminder?.enabled && (
             <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-lg font-medium flex items-center gap-1">
               <MapPin className="w-3 h-3" />
               地点触发
             </span>
            )}
            {task.reminder_time && (
             <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-lg font-medium flex items-center gap-1">
               <Clock className="w-3 h-3" />
               {format(new Date(task.reminder_time), 'HH:mm')}提醒
             </span>
            )}
            
            <Badge variant="secondary" className={cn("rounded-lg font-medium", theme.bg, theme.text)}>
              {theme.icon}
              <span className="ml-1">{categoryLabel}</span>
            </Badge>
          </div>
          
          <button className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-gradient-to-br shadow-inner",
              theme.gradient
            )}>
              {theme.emoji}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-stone-800 mb-1 truncate",
              completed && "line-through text-stone-400"
            )}>
              {task.title}
            </h3>
            <p className="text-sm text-stone-500 mb-2 line-clamp-1">
              {task.description || "暂无描述"}
            </p>
            
            <div className="flex items-center gap-3 text-xs">
              {(task.location_reminder?.location_name || task.reminder_time) && (
                <span className="flex items-center gap-1 text-stone-400">
                  {task.location_reminder?.enabled ? <MapPin className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {task.location_reminder?.location_name || (task.reminder_time ? format(new Date(task.reminder_time), 'MM-dd HH:mm') : '')}
                </span>
              )}
              {triggerType === 'location' && (
                <>
                  <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    顺路提醒
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button 
              onClick={handleComplete}
              className={cn(
                "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all group",
                completed 
                  ? "border-green-500 bg-green-50 text-green-600" 
                  : "border-stone-200 hover:border-green-500 hover:bg-green-50 text-stone-300 hover:text-green-600"
              )}
            >
              <Check className="w-5 h-5" />
            </button>
            <span className={cn(
              "text-xs font-medium",
              completed ? "text-stone-400" : "text-stone-400"
            )}>
              {getTimeText()}
            </span>
          </div>
        </div>

        {!completed && (
          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
            {triggerType === 'location' ? (
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>将在到达附近时提醒</span>
              </div>
            ) : task.ai_analysis?.suggestions?.[0] ? (
              <div className="flex items-start gap-2 bg-purple-50 p-2 rounded-lg w-full">
                <Navigation className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-purple-700 truncate">{task.ai_analysis.suggestions[0]}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <Clock className="w-3 h-3" />
                <span>{task.reminder_time ? '按时提醒' : '待定时间'}</span>
              </div>
            )}
            
            <button className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors">
              <Clock className="w-3 h-3" />
              推迟
            </button>
          </div>
        )}
      </div>
    </div>
  );
}