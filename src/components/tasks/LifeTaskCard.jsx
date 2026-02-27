import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, Clock, MapPin, Repeat, MoreHorizontal, 
  ShoppingBag, Zap, Calendar, Navigation, 
  Briefcase, Heart, Package, Sun, Flag, Lightbulb,
  AlertCircle, Share2, Edit, Trash2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import TaskContextInfo from "./TaskContextInfo";

export default function LifeTaskCard({ 
  task, 
  onComplete, 
  onEdit,
  onShare
}) {
  const [completed, setCompleted] = useState(task.status === 'completed');

  const handleComplete = (e) => {
    e.stopPropagation();
    setCompleted(!completed);
    onComplete(task, !completed);
  };

  // Determine theme based on category
  const getTheme = () => {
    switch(task.category) {
      case 'work': return {
        color: 'blue',
        icon: <Briefcase className="w-5 h-5" />,
        emoji: '📝',
        gradient: 'from-blue-100 to-blue-50'
      };
      case 'health': return {
        color: 'rose',
        icon: <Heart className="w-5 h-5" />,
        emoji: '🌱',
        gradient: 'from-rose-100 to-rose-50'
      };
      case 'family': return {
        color: 'purple',
        icon: <Heart className="w-5 h-5" />,
        emoji: '👨‍👩‍👧‍👦',
        gradient: 'from-purple-100 to-purple-50'
      };
      case 'shopping': return {
        color: 'purple',
        icon: <ShoppingBag className="w-5 h-5" />,
        emoji: '📦',
        gradient: 'from-purple-100 to-purple-50'
      };
      default: return {
        color: 'green',
        icon: <Check className="w-5 h-5" />,
        emoji: '📝',
        gradient: 'from-green-100 to-green-50'
      };
    }
  };

  const theme = getTheme();
  
  // Helper to get relative time text
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
      {/* Background decoration */}
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-16 -mt-16 opacity-30 pointer-events-none",
        `bg-${theme.color}-100`
      )} />

      <div className="relative z-10">
        {/* Header Tags */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Primary Trigger Tag */}
            <span className={cn(
              "px-2 py-1 text-xs rounded-lg font-medium flex items-center gap-1",
              triggerType === 'location' ? "bg-green-100 text-green-700" :
              triggerType === 'repeat' ? "bg-blue-100 text-blue-700" :
              "bg-amber-100 text-amber-700"
            )}>
              {triggerType === 'location' ? <Navigation className="w-3 h-3" /> : 
               triggerType === 'repeat' ? <Repeat className="w-3 h-3" /> :
               <Clock className="w-3 h-3" />}
              {triggerType === 'location' ? '地点触发' : 
               triggerType === 'repeat' ? '习惯' :
               task.reminder_time ? format(new Date(task.reminder_time), 'HH:mm', { locale: zhCN }) : '稍后'}
            </span>
            
            {/* Secondary/Category Tag */}
            <span className={cn(
              "px-2 py-1 bg-stone-100 text-stone-600 text-xs rounded-lg font-medium flex items-center gap-1"
            )}>
              {task.category === 'work' ? <Briefcase className="w-3 h-3" /> :
               task.category === 'health' ? <Heart className="w-3 h-3" /> :
               <Zap className="w-3 h-3" />}
              {task.category === 'work' ? '工作' : 
               task.category === 'health' ? '健康' : 
               task.category === 'shopping' ? '购物' : '生活'}
            </span>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onShare && onShare();
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>分享约定</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit && onEdit();
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Edit className="w-4 h-4" />
                <span>编辑</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Main Content */}
        <div className="flex gap-4">
          {/* Icon Box */}
          <div className="flex-shrink-0">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-gradient-to-br shadow-inner",
              theme.gradient
            )}>
              {theme.emoji}
            </div>
          </div>

          {/* Text Content */}
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
            
            {/* Context Line */}
            <div className="flex items-center gap-3 text-xs">
              {task.reminder_time && (
                <span className="flex items-center gap-1 text-stone-400">
                  <Clock className="w-3 h-3" />
                  {format(new Date(task.reminder_time), 'MM-dd HH:mm')}
                </span>
              )}
              {task.repeat_rule !== 'none' && (
                <>
                  <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                  <span className="text-rose-600 font-medium flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    已坚持 {Math.floor(Math.random() * 20) + 1} 天
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right Action: Check & Time */}
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

        {/* Context-Aware Status & AI Suggestions */}
        <TaskContextInfo task={task} />
      </div>
    </div>
  );
}