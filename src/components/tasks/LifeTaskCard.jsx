import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, Clock, MapPin, Repeat, MoreHorizontal, 
  ShoppingBag, Zap, Calendar, Navigation, 
  Briefcase, Heart, Package, Sun, Flag, Lightbulb,
  AlertCircle, Sprout
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  // 1. Analyze Task Context & Styles
  const getTaskContext = () => {
    // Default context
    let context = {
      theme: 'stone',
      primaryEmoji: '✨',
      tags: [],
      smartSuggestion: null,
      triggerText: null, // For footer "将在...时提醒"
      gradient: 'from-stone-100 to-stone-50',
      textColor: 'text-stone-500',
      bgColor: 'bg-stone-50',
      checkColor: 'hover:border-stone-500',
      iconBg: 'bg-stone-100',
      isShopping: false
    };

    // --- Detect "Errand / Shopping" (Green/Stone) ---
    // Example: "买一桶油回家"
    if (task.title.includes('买') || task.title.includes('超市') || task.title.includes('便利店') || task.category === 'shopping') {
       context.theme = 'emerald';
       context.primaryEmoji = '🛒';
       if (task.title.includes('油')) context.primaryEmoji = '🛢️';
       if (task.title.includes('菜')) context.primaryEmoji = '🥬';
       
       context.gradient = 'from-emerald-50 to-white'; // Subtler gradient for icon
       context.textColor = 'text-emerald-700';
       context.bgColor = 'bg-white';
       context.checkColor = 'hover:border-emerald-500';
       context.iconBg = 'bg-emerald-50 text-emerald-600';
       context.isShopping = true;

       // Mock trigger text for demo
       context.triggerText = "将在你离开公司时提醒"; 
    }
    
    // --- Detect "Habit / Morning Routine" (Rose Theme) ---
    // Example: "给阳台的花浇水"
    else if (task.repeat_rule !== 'none' || task.category === 'health' || task.title.includes('浇') || task.title.includes('花')) {
      const hour = task.reminder_time ? new Date(task.reminder_time).getHours() : 9;
      const isMorning = hour < 10;
      context.theme = 'rose';
      context.primaryEmoji = '🌱'; 
      context.gradient = 'from-rose-50 to-white';
      context.textColor = 'text-rose-700';
      context.bgColor = 'bg-white';
      context.checkColor = 'hover:border-rose-500';
      context.iconBg = 'bg-rose-50 text-rose-600';
      
      if (isMorning) {
        context.tags.push({ text: '晨间习惯', icon: Sun, color: 'bg-rose-50 text-rose-600 border border-rose-100' });
      } else {
        context.tags.push({ text: '日常习惯', icon: Heart, color: 'bg-rose-50 text-rose-600 border border-rose-100' });
      }

      if (task.repeat_rule === 'daily' || task.repeat_rule === 'custom') {
        context.tags.push({ text: '每天', icon: Repeat, color: 'bg-blue-50 text-blue-600 border border-blue-100' });
      }
    }

    // --- Detect "Package / Pickup" (Purple Theme) ---
    // Example: "取快递"
    else if (task.title.includes('取') || task.title.includes('快递')) {
      context.theme = 'purple';
      context.primaryEmoji = '📦';
      context.gradient = 'from-purple-50 to-white';
      context.textColor = 'text-purple-700';
      context.bgColor = 'bg-white';
      context.checkColor = 'hover:border-purple-500';
      context.iconBg = 'bg-purple-50 text-purple-600';

      context.tags.push({ text: '待取件', icon: Package, color: 'bg-purple-50 text-purple-600 border border-purple-100' });
      
      const isUrgent = task.priority === 'urgent' || task.priority === 'high' || true; // Force show for demo
      if (isUrgent) {
        context.tags.push({ text: '即将超时', icon: AlertCircle, color: 'bg-amber-50 text-amber-600 border border-amber-100' });
      }
    }

    // --- Detect Location Triggers & Smart Suggestions ---
    if (context.isShopping) {
       context.triggerText = "将在你离开公司时提醒";
    }

    if (task.ai_analysis?.suggestions?.[0]) {
      context.smartSuggestion = task.ai_analysis.suggestions[0];
    } else if (task.title.includes('快递')) {
      context.smartSuggestion = "检测到今晚你会经过驿站，建议在 18:30 左右提醒你取件";
    }

    return context;
  };

  const ctx = getTaskContext();
  
  const getRelativeTime = () => {
    if (!task.reminder_time) return "待定";
    const date = new Date(task.reminder_time);
    const now = new Date();
    const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "已过期";
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "明天";
    return `${diffDays}天后`;
  };

  const formatTime = () => {
    if (!task.reminder_time) return "";
    return format(new Date(task.reminder_time), 'H:mm');
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target.closest('button')) return;
        onEdit && onEdit();
      }}
      className={cn(
        "task-card group bg-white rounded-[24px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer mb-4",
        completed && "opacity-60 grayscale-[0.5]"
      )}
    >
      {/* 1. Tags Row (Only if tags exist) */}
      {ctx.tags.length > 0 && (
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {ctx.tags.map((tag, i) => (
              <span key={i} className={cn("px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5", tag.color)}>
                <tag.icon className="w-3.5 h-3.5" />
                {tag.text}
              </span>
            ))}
          </div>
          
          <button className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Main Content Row */}
      <div className="flex gap-4">
        {/* Large Icon Box */}
        <div className="flex-shrink-0">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm border border-slate-50",
            ctx.iconBg
          )}>
            {ctx.primaryEmoji}
          </div>
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start">
             <div className="w-full">
                <div className="flex items-center justify-between">
                   <h3 className={cn(
                     "font-bold text-slate-800 mb-1.5 text-[17px] leading-tight",
                     completed && "line-through text-slate-400"
                   )}>
                     {task.title}
                   </h3>
                   {/* If no tags, show more button here */}
                   {ctx.tags.length === 0 && (
                       <button className="p-1.5 -mt-1 -mr-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="w-4 h-4" />
                       </button>
                   )}
                </div>
                
                <p className="text-sm text-slate-500 mb-2.5 line-clamp-1 pr-4">
                  {task.description || (task.title.includes('花') ? "多肉少浇，绿萝浇透" : task.title.includes('快递') ? "菜鸟驿站，取件码：8-2-3014" : task.title.includes('油') ? "记得买非转基因的，家里快用完了" : "暂无描述")}
                </p>
             </div>
          </div>

          {/* Metadata Row */}
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
             {/* Case: Shopping */}
             {ctx.isShopping && (
                <>
                  <span className="flex items-center gap-1.5">
                     <MapPin className="w-3.5 h-3.5" />
                     公司附近便利店
                  </span>
                  <span className="text-slate-200">•</span>
                  <span className="flex items-center gap-1 text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                     <Zap className="w-3 h-3" />
                     下班顺路
                  </span>
                </>
             )}

             {/* Case: Habit */}
             {ctx.theme === 'rose' && (
                <>
                  <span className="flex items-center gap-1.5">
                     <Clock className="w-3.5 h-3.5" />
                     每天 {formatTime() || '8:00'}
                  </span>
                  <span className="text-slate-200">•</span>
                  <span className="flex items-center gap-1 text-rose-600 font-medium">
                     <Heart className="w-3 h-3 fill-current" />
                     已坚持 {task.snooze_count || 12} 天
                  </span>
                </>
             )}

             {/* Case: Package */}
             {ctx.theme === 'purple' && (
                <>
                  <span className="flex items-center gap-1.5">
                     <MapPin className="w-3.5 h-3.5" />
                     小区东门
                  </span>
                  <span className="text-slate-200">•</span>
                  <span className="flex items-center gap-1 text-purple-600 font-medium">
                     <Navigation className="w-3 h-3" />
                     回家顺路
                  </span>
                </>
             )}

             {/* Fallback */}
             {!ctx.isShopping && ctx.theme !== 'rose' && ctx.theme !== 'purple' && (
                <>
                  <span className="flex items-center gap-1.5">
                     <Clock className="w-3.5 h-3.5" />
                     {format(new Date(task.reminder_time), 'M月d日 HH:mm', { locale: zhCN })}
                  </span>
                </>
             )}
          </div>
        </div>
      </div>

      {/* 3. Footer / Trigger Row */}
      {(!completed && (ctx.triggerText || ctx.smartSuggestion)) && (
        <div className="mt-4 pt-4 border-t border-slate-50">
           {/* Case A: Trigger Text (Green dot style) */}
           {ctx.triggerText && (
              <div className="flex items-center gap-2.5 text-sm text-slate-600 pl-1">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                 {ctx.triggerText}
              </div>
           )}

           {/* Case B: Smart Suggestion (Purple box style) */}
           {ctx.smartSuggestion && (
              <div className="p-3 bg-purple-50/80 rounded-xl flex items-start gap-2.5">
                 <Lightbulb className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                 <p className="text-xs text-purple-700 leading-relaxed font-medium">
                   {ctx.smartSuggestion}
                 </p>
              </div>
           )}
        </div>
      )}
    </div>
  );
}