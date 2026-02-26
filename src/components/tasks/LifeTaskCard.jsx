import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, Clock, MapPin, Repeat, MoreHorizontal, 
  ShoppingBag, Zap, Calendar, Navigation, 
  Briefcase, Heart, Package, Sun, Flag, Lightbulb,
  AlertCircle, Sprout, Home
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
    let context = {
      theme: 'stone',
      primaryEmoji: '✨',
      tags: [],
      smartSuggestion: null,
      footerHint: null,
      gradient: 'from-stone-50 to-stone-50', // Default light gray
      textColor: 'text-stone-600',
      bgColor: 'bg-white',
      iconBg: 'bg-stone-50',
      accentColor: 'text-stone-600',
      actionIcon: null // Special action icon next to info
    };

    // --- CASE 1: Habit / Routine (Flower style) ---
    const hour = task.reminder_time ? new Date(task.reminder_time).getHours() : 9;
    if (task.repeat_rule !== 'none' || task.category === 'health' || task.title.includes('浇') || task.title.includes('花')) {
      context.theme = 'habit';
      context.primaryEmoji = '🌱';
      context.gradient = 'from-rose-50 to-rose-50';
      context.iconBg = 'bg-rose-50';
      context.accentColor = 'text-rose-600';
      
      const isMorning = hour < 10;
      if (isMorning) {
        context.tags.push({ text: '晨间习惯', icon: Sun, color: 'bg-rose-100 text-rose-700 border-rose-100' });
      } else {
        context.tags.push({ text: '日常习惯', icon: Heart, color: 'bg-rose-100 text-rose-700 border-rose-100' });
      }

      if (task.repeat_rule === 'daily') {
        context.tags.push({ text: '每天', icon: Repeat, color: 'bg-blue-100 text-blue-700 border-blue-100' });
      }
      
      // Streak Info
      context.actionIcon = { icon: Heart, text: '已坚持 12 天', color: 'text-rose-600' };
    }

    // --- CASE 2: Package / Urgent (Package style) ---
    else if (task.title.includes('取') || task.title.includes('快递') || task.category === 'shopping') {
      context.theme = 'urgent';
      context.primaryEmoji = '📦';
      context.gradient = 'from-purple-50 to-purple-50';
      context.iconBg = 'bg-purple-50';
      
      context.tags.push({ text: '待取件', icon: Package, color: 'bg-purple-100 text-purple-700 border-purple-100' });
      context.tags.push({ text: '即将超时', icon: AlertCircle, color: 'bg-amber-100 text-amber-700 border-amber-100' });

      context.actionIcon = { icon: Navigation, text: '回家顺路', color: 'text-purple-600' };
      
      // Mock smart suggestion
      context.smartSuggestion = "检测到今晚你会经过驿站，建议在 18:30 左右提醒你取件";
    }

    // --- CASE 3: Normal / Context Aware (Oil style) ---
    else {
      context.theme = 'normal';
      context.primaryEmoji = task.title.includes('油') ? '🛢️' : (task.title.includes('买') ? '🛒' : '✨');
      context.iconBg = 'bg-green-50';
      
      // Contextual Hint (Lightning)
      if (task.location_reminder?.enabled || task.title.includes('买')) {
         context.actionIcon = { icon: Zap, text: '下班顺路', color: 'text-green-600' };
         context.footerHint = "将在你离开公司时提醒";
      }
    }

    return context;
  };

  const ctx = getTaskContext();
  
  const formatTime = () => {
    if (!task.reminder_time) return "";
    return format(new Date(task.reminder_time), 'HH:mm');
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target.closest('button')) return;
        onEdit && onEdit();
      }}
      className={cn(
        "task-card group bg-white rounded-3xl p-5 shadow-sm border border-stone-100 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
        completed && "opacity-60 grayscale-[0.5]"
      )}
    >
      {/* 1. Tags Row (Only if tags exist) */}
      {ctx.tags.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          {ctx.tags.map((tag, i) => (
            <span key={i} className={cn("px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5", tag.color)}>
              <tag.icon className="w-3.5 h-3.5" />
              {tag.text}
            </span>
          ))}
        </div>
      )}

      {/* 2. Main Content */}
      <div className="flex gap-4 items-start">
        {/* Large Icon */}
        <div className="flex-shrink-0 pt-0.5">
          <div className={cn(
            "w-14 h-14 rounded-[18px] flex items-center justify-center text-3xl shadow-sm",
            ctx.iconBg
          )}>
            {ctx.primaryEmoji}
          </div>
        </div>

        {/* Text & Metadata */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex justify-between items-start">
             <h3 className={cn(
               "font-bold text-slate-800 text-[17px] leading-tight",
               completed && "line-through text-slate-400"
             )}>
               {task.title}
             </h3>
             
             {/* Completion Circle (Subtle) */}
             <button 
                onClick={handleComplete}
                className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ml-2",
                  completed 
                    ? "border-green-500 bg-green-500 text-white" 
                    : "border-slate-200 text-transparent hover:border-green-400"
                )}
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </button>
          </div>

          <p className="text-[13px] text-slate-500 line-clamp-1">
            {task.description || (task.title.includes('花') ? "多肉少浇，绿萝浇透" : task.title.includes('快递') ? "取件码：8-2-3014" : task.title.includes('油') ? "记得买非转基因的，家里快用完了" : "暂无描述")}
          </p>
          
          {/* Metadata Info Row */}
          <div className="flex items-center gap-2 text-[13px] pt-1">
            <span className="flex items-center gap-1.5 text-slate-400">
               {task.location_reminder?.enabled || ctx.theme === 'urgent' || ctx.theme === 'normal' ? (
                 <>
                   <MapPin className="w-3.5 h-3.5" />
                   {task.location_reminder?.location_name || (task.title.includes('快递') ? "小区东门" : "公司附近便利店")}
                 </>
               ) : (
                 <>
                   <Clock className="w-3.5 h-3.5" />
                   {task.repeat_rule !== 'none' ? `每天 ${formatTime()}` : (task.reminder_time ? format(new Date(task.reminder_time), 'M月d日 HH:mm', { locale: zhCN }) : '待定')}
                 </>
               )}
            </span>

            {/* Separator Dot */}
            <span className="text-slate-300 text-[10px]">•</span>

            {/* Context Action/Status */}
            {ctx.actionIcon ? (
               <span className={cn("font-medium flex items-center gap-1", ctx.actionIcon.color)}>
                  <ctx.actionIcon.icon className="w-3.5 h-3.5" />
                  {ctx.actionIcon.text}
               </span>
            ) : (
               <span className="text-slate-400">
                  {task.priority === 'urgent' ? '高优先级' : '进行中'}
               </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Footer Areas */}
      
      {/* Simple Footer Hint (Green dot style) */}
      {!completed && ctx.footerHint && (
         <div className="mt-4 pt-3 border-t border-slate-50 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <p className="text-[13px] text-slate-500">{ctx.footerHint}</p>
         </div>
      )}

      {/* Smart Suggestion Box (Purple style) */}
      {!completed && ctx.smartSuggestion && (
        <div className="mt-4 p-3 bg-[#fbf7ff] rounded-xl flex items-start gap-2.5">
           <Lightbulb className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
           <p className="text-[13px] leading-relaxed text-purple-700">
             {ctx.smartSuggestion}
           </p>
        </div>
      )}
    </div>
  );
}