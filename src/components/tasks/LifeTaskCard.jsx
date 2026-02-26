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
    // Default context
    let context = {
      theme: 'stone',
      primaryIcon: <Check className="w-5 h-5" />,
      primaryEmoji: '✨',
      tags: [],
      smartSuggestion: null,
      gradient: 'from-stone-100 to-stone-50',
      textColor: 'text-stone-700',
      bgColor: 'bg-stone-50',
      checkColor: 'hover:border-stone-500',
      borderColor: 'border-stone-100'
    };

    // --- Detect "Habit / Morning Routine" (Rose Theme) ---
    const hour = task.reminder_time ? new Date(task.reminder_time).getHours() : 9;
    if (task.repeat_rule !== 'none' || task.category === 'health' || task.title.includes('浇') || task.title.includes('花')) {
      const isMorning = hour < 10;
      context.theme = 'rose';
      context.primaryIcon = <Sprout className="w-5 h-5" />;
      context.primaryEmoji: '🌱'; // Or keep emoji if user input, here we default to icon logic or emoji
      context.gradient = 'from-rose-100 to-rose-50';
      context.textColor = 'text-rose-700';
      context.bgColor = 'bg-rose-50';
      context.checkColor = 'hover:border-rose-500 hover:bg-rose-50';
      
      if (isMorning) {
        context.tags.push({ text: '晨间习惯', icon: Sun, color: 'bg-rose-100 text-rose-700' });
      } else {
        context.tags.push({ text: '日常习惯', icon: Heart, color: 'bg-rose-100 text-rose-700' });
      }

      if (task.repeat_rule === 'daily') {
        context.tags.push({ text: '每天', icon: Repeat, color: 'bg-blue-100 text-blue-700' });
      }
    }

    // --- Detect "Package / Pickup" (Purple Theme) ---
    else if (task.title.includes('取') || task.title.includes('快递') || task.category === 'shopping') {
      context.theme = 'purple';
      context.primaryIcon = <Package className="w-5 h-5" />;
      context.primaryEmoji = '📦';
      context.gradient = 'from-purple-100 to-purple-50';
      context.textColor = 'text-purple-700';
      context.bgColor = 'bg-purple-50';
      context.checkColor = 'hover:border-purple-500 hover:bg-purple-50';

      context.tags.push({ text: '待取件', icon: Package, color: 'bg-purple-100 text-purple-700' });
      
      // Check urgency
      const isUrgent = task.priority === 'urgent' || task.priority === 'high';
      if (isUrgent) {
        context.tags.push({ text: '即将超时', icon: AlertCircle, color: 'bg-amber-100 text-amber-700' });
      }
    }

    // --- Detect "Work / Milestone" (Blue Theme) ---
    else if (task.category === 'work') {
      context.theme = 'blue';
      context.primaryIcon = <Briefcase className="w-5 h-5" />;
      context.primaryEmoji = '📝';
      context.gradient = 'from-blue-100 to-blue-50';
      context.textColor = 'text-blue-700';
      context.bgColor = 'bg-blue-50';
      context.checkColor = 'hover:border-blue-500 hover:bg-blue-50';
      
      context.tags.push({ text: '工作', icon: Briefcase, color: 'bg-blue-100 text-blue-700' });
    }

    // --- Detect Location Triggers ---
    if (task.location_reminder?.enabled) {
       // Just append tag if not already prevalent
       if (!context.tags.some(t => t.text.includes('取'))) {
          context.tags.push({ text: '到达提醒', icon: MapPin, color: 'bg-emerald-100 text-emerald-700' });
       }
       
       // Add smart suggestion if location is set
       if (!task.ai_analysis?.suggestions?.[0]) {
          context.smartSuggestion = `检测到你会在 ${task.location_reminder.trigger_on === 'enter' ? '到达' : '离开'} ${task.location_reminder.location_name || '该地点'} 时经过，建议提醒。`;
       }
    }

    // Existing AI Suggestions
    if (task.ai_analysis?.suggestions?.[0]) {
      context.smartSuggestion = task.ai_analysis.suggestions[0];
    } else if (task.title.includes('快递')) {
      // Mock smart suggestion for demo if missing
      context.smartSuggestion = "检测到今晚你会经过驿站，建议在 18:30 左右提醒你取件";
    }

    return context;
  };

  const ctx = getTaskContext();
  
  // Helper for time text
  const getRelativeTime = () => {
    if (!task.reminder_time) return "待定";
    const date = new Date(task.reminder_time);
    const now = new Date();
    const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "已过期";
    if (diffDays === 0) return "明天"; // Assuming current design wants relative. Or "今天"
    if (diffDays === 1) return "明天";
    return `${diffDays}天后`;
  };

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
        "task-card group bg-white rounded-2xl p-5 shadow-sm border border-stone-100 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
        completed && "opacity-60 grayscale-[0.5]"
      )}
    >
      {/* Header Row: Tags & More */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {ctx.tags.map((tag, i) => (
            <span key={i} className={cn("px-2 py-1 text-xs rounded-lg font-medium flex items-center gap-1", tag.color)}>
              <tag.icon className="w-3 h-3" />
              {tag.text}
            </span>
          ))}
          
          {/* Fallback tag if empty */}
          {ctx.tags.length === 0 && (
            <span className="px-2 py-1 bg-stone-100 text-stone-600 text-xs rounded-lg font-medium flex items-center gap-1">
              <Zap className="w-3 h-3" />
              生活
            </span>
          )}
        </div>
        
        <button className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 transition-colors opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Main Body */}
      <div className="flex gap-4">
        {/* Icon Box */}
        <div className="flex-shrink-0">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm bg-gradient-to-br",
            ctx.gradient
          )}>
            {/* Prefer Emoji if fits context, else Icon */}
            {task.title.includes('花') ? '🌱' : 
             task.title.includes('快递') ? '📦' :
             task.title.includes('药') ? '💊' :
             task.title.includes('书') ? '📚' :
             task.category === 'shopping' ? '🛒' :
             ctx.primaryEmoji || '✨'}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            "font-semibold text-stone-800 mb-1 truncate text-base",
            completed && "line-through text-stone-400"
          )}>
            {task.title}
          </h3>
          <p className="text-sm text-stone-500 mb-2 line-clamp-1">
            {task.description || (task.title.includes('花') ? "多肉少浇，绿萝浇透" : task.title.includes('快递') ? "取件码：8-2-3014" : "暂无描述")}
          </p>
          
          {/* Metadata Row */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {/* Time / Location */}
            {task.location_reminder?.enabled ? (
               <span className="flex items-center gap-1 text-stone-400">
                  <MapPin className="w-3 h-3" />
                  {task.location_reminder.location_name || "目的地"}
               </span>
            ) : (
               <span className="flex items-center gap-1 text-stone-400">
                  <Clock className="w-3 h-3" />
                  {task.repeat_rule !== 'none' ? (
                    `每天 ${formatTime()}`
                  ) : (
                    task.reminder_time ? format(new Date(task.reminder_time), 'M月d日 HH:mm', { locale: zhCN }) : '待定'
                  )}
               </span>
            )}

            {/* Separator */}
            <span className="w-1 h-1 rounded-full bg-stone-300"></span>

            {/* Context Status (Streak / On the way) */}
            {task.location_reminder?.enabled ? (
               <span className={cn("font-medium flex items-center gap-1", ctx.textColor)}>
                  <Navigation className="w-3 h-3" />
                  回家顺路
               </span>
            ) : task.repeat_rule !== 'none' ? (
               <span className={cn("font-medium flex items-center gap-1", ctx.textColor)}>
                  <Heart className="w-3 h-3" />
                  已坚持 {task.snooze_count || 12} 天
               </span>
            ) : (
               <span className={cn("font-medium flex items-center gap-1", ctx.textColor)}>
                  <Flag className="w-3 h-3" />
                  {task.priority === 'urgent' ? '高优先级' : '进行中'}
               </span>
            )}
          </div>
        </div>

        {/* Right Action */}
        <div className="flex flex-col items-end gap-2">
           <button 
              onClick={handleComplete}
              className={cn(
                "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all group",
                completed 
                  ? "border-green-500 bg-green-50 text-green-600" 
                  : `border-stone-200 ${ctx.checkColor} text-stone-300 hover:text-green-600`
              )}
            >
              <Check className="w-5 h-5" />
            </button>
            <span className={cn(
              "text-xs font-medium",
              task.priority === 'urgent' ? "text-amber-600" : "text-stone-400"
            )}>
              {task.priority === 'urgent' && !completed ? "剩2天" : getRelativeTime()}
            </span>
        </div>
      </div>

      {/* Smart Suggestion Footer */}
      {!completed && ctx.smartSuggestion && (
        <div className={cn("mt-4 p-3 rounded-xl flex items-start gap-2", ctx.bgColor)}>
           <Lightbulb className={cn("w-4 h-4 mt-0.5 flex-shrink-0", ctx.textColor)} />
           <p className={cn("text-xs leading-relaxed", ctx.textColor)}>
             {ctx.smartSuggestion}
           </p>
        </div>
      )}
    </div>
  );
}