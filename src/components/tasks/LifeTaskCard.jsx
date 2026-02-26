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
       if (task.title.includes('药') || task.title.includes('维')) context.primaryEmoji = '💊';
       if (task.title.includes('书')) context.primaryEmoji = '📚';
       
       context.gradient = 'from-green-100 to-green-50'; 
       context.textColor = 'text-stone-500';
       context.bgColor = 'bg-white';
       context.checkColor = 'hover:border-green-500 hover:bg-green-50';
       context.iconBg = 'bg-gradient-to-br from-green-100 to-green-50 text-green-700';
       context.isShopping = true;

       if (task.title.includes('药')) {
         context.gradient = 'from-rose-100 to-rose-50';
         context.iconBg = 'bg-gradient-to-br from-rose-100 to-rose-50 text-rose-700';
         context.checkColor = 'hover:border-rose-500 hover:bg-rose-50';
       } else if (task.title.includes('书')) {
         context.gradient = 'from-blue-100 to-blue-50';
         context.iconBg = 'bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700';
         context.checkColor = 'hover:border-blue-500 hover:bg-blue-50';
       }

       // Mock trigger text for demo
       if (task.title.includes('油')) {
         context.tags.push({ text: '地点触发', icon: Navigation, color: 'bg-stone-100 text-stone-600' });
         context.tags.push({ text: '18:00前', icon: Clock, color: 'bg-amber-100 text-amber-700' });
         context.triggerText = "将在你离开公司时提醒";
       } else if (task.title.includes('药')) {
         context.tags.push({ text: '周末提醒', icon: Calendar, color: 'bg-rose-100 text-rose-700' });
         context.tags.push({ text: '周六', icon: null, color: 'bg-transparent text-stone-400 p-0 font-normal' });
       } else if (task.title.includes('书')) {
         context.tags.push({ text: '地点触发', icon: Navigation, color: 'bg-stone-100 text-stone-600' });
         context.tags.push({ text: '已逾期3天', icon: null, color: 'bg-transparent text-rose-500 p-0 font-medium' });
         context.smartSuggestion = "已逾期，建议优先处理。检测到周末会去市区，可顺路。";
       }
    }
    
    // --- Detect "Habit / Morning Routine" (Rose Theme) ---
    // Example: "给阳台的花浇水"
    else if (task.repeat_rule !== 'none' || task.category === 'health' || task.title.includes('浇') || task.title.includes('花')) {
      const hour = task.reminder_time ? new Date(task.reminder_time).getHours() : 9;
      const isMorning = hour < 10;
      context.theme = 'rose';
      context.primaryEmoji = '🌱'; 
      context.gradient = 'from-rose-100 to-rose-50';
      context.textColor = 'text-stone-500';
      context.bgColor = 'bg-white';
      context.checkColor = 'hover:border-green-500 hover:bg-green-50'; // Consistent check behavior
      context.iconBg = 'bg-gradient-to-br from-rose-100 to-rose-50 text-rose-700';
      
      context.tags.push({ text: '每日习惯', icon: Repeat, color: 'bg-stone-100 text-stone-600' });
      if (isMorning) {
        context.tags.push({ text: '明天 8:00', icon: Sun, color: 'bg-blue-100 text-blue-700' });
      } else {
        context.tags.push({ text: '明天', icon: Calendar, color: 'bg-blue-100 text-blue-700' });
      }
    }

    // --- Detect "Package / Pickup" (Purple Theme) ---
    // Example: "取快递"
    else if (task.title.includes('取') || task.title.includes('快递')) {
      context.theme = 'purple';
      context.primaryEmoji = '📦';
      context.gradient = 'from-purple-100 to-purple-50';
      context.textColor = 'text-stone-500';
      context.bgColor = 'bg-white';
      context.checkColor = 'hover:border-green-500 hover:bg-green-50';
      context.iconBg = 'bg-gradient-to-br from-purple-100 to-purple-50 text-purple-700';

      context.tags.push({ text: '待取件', icon: Package, color: 'bg-purple-100 text-purple-700' });
      context.tags.push({ text: '即将超时', icon: AlertCircle, color: 'bg-amber-100 text-amber-700' });
    }

    // --- Smart Suggestions Override ---
    if (task.ai_analysis?.suggestions?.[0]) {
      context.smartSuggestion = task.ai_analysis.suggestions[0];
    } else if (task.title.includes('快递')) {
      context.smartSuggestion = "检测到今晚你会经过驿站，建议在 18:30 左右提醒你取件";
    }

    return context;
  };

  const ctx = getTaskContext();
  
  const getRelativeTime = () => {
    if (task.title.includes('书')) return "下次经过";
    if (task.title.includes('药')) return "3天后";
    
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
        "bg-white rounded-[20px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-stone-100 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer mb-3 fade-in",
        completed && "opacity-60 grayscale-[0.5]"
      )}
    >
      <div className="relative z-10">
        {/* 1. Header Row: Tags & More */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {ctx.tags.map((tag, i) => (
              <span key={i} className={cn("px-2 py-1 text-xs rounded-lg font-medium flex items-center gap-1", tag.color)}>
                {tag.icon && <tag.icon className="w-3 h-3" />}
                {tag.text}
              </span>
            ))}
          </div>
          <button className="p-1.5 hover:bg-stone-50 rounded-lg text-stone-400 transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Main Content Row */}
        <div className="flex gap-4">
          {/* Large Icon Box */}
          <div className="flex-shrink-0">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm",
              ctx.iconBg
            )}>
              {ctx.primaryEmoji}
            </div>
          </div>

          {/* Text Content */}
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-stone-800 mb-1 truncate text-base",
              completed && "line-through text-stone-400"
            )}>
              {task.title}
            </h3>
            <p className="text-sm text-stone-500 mb-2 line-clamp-2 leading-relaxed">
              {task.description || (task.title.includes('花') ? "多肉少浇，绿萝浇透" : task.title.includes('快递') ? "菜鸟驿站，取件码：8-2-3014" : task.title.includes('油') ? "记得买非转基因的，家里快用完了" : task.title.includes('药') ? "妈妈嘱咐的，记得要品牌货" : task.title.includes('书') ? "《设计心理学》和《原子习惯》" : "暂无描述")}
            </p>
            
            {/* Metadata Row */}
            <div className="flex items-center gap-3 text-xs text-stone-400 mb-1">
               {/* Case: Shopping / Errand */}
               {task.title.includes('油') && (
                  <>
                    <span className="flex items-center gap-1">
                       <MapPin className="w-3 h-3" />
                       公司附近便利店
                    </span>
                    <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                    <span className="text-green-600 font-medium flex items-center gap-1">
                       <Zap className="w-3 h-3" />
                       下班顺路
                    </span>
                  </>
               )}

               {/* Case: Package */}
               {task.title.includes('快递') && (
                  <>
                    <span className="flex items-center gap-1">
                       <MapPin className="w-3 h-3" />
                       小区东门
                    </span>
                    <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                    <span className="text-purple-600 font-medium flex items-center gap-1">
                       <Navigation className="w-3 h-3" />
                       回家顺路
                    </span>
                  </>
               )}

               {/* Case: Habit */}
               {task.title.includes('花') && (
                  <>
                    <span className="flex items-center gap-1">
                       <Clock className="w-3 h-3" />
                       每天 8:00
                    </span>
                    <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                    <span className="text-rose-600 font-medium flex items-center gap-1">
                       <Heart className="w-3 h-3" />
                       已坚持 12 天
                    </span>
                  </>
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
                  "text-xs",
                  task.priority === 'urgent' || task.title.includes('快递') ? "text-amber-600 font-medium" : "text-stone-400"
                )}>
                  {task.priority === 'urgent' && !completed ? "剩2天" : getRelativeTime()}
              </span>
          </div>
        </div>

        {/* 3. Footer / Trigger Row */}
        {!completed && (
          <>
             {/* Case A: Trigger Text (Green dot style) */}
             {ctx.triggerText && (
                <div className="mt-4 pt-3 flex items-center justify-between border-t border-stone-50">
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>{ctx.triggerText}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); }} className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors">
                        <Clock className="w-3 h-3" />
                        推迟
                    </button>
                </div>
             )}

             {/* Case B: Smart Suggestion (Purple/Rose box style) */}
             {ctx.smartSuggestion && (
                <div className={cn(
                  "mt-4 p-3 rounded-xl flex items-start gap-2",
                  task.title.includes('书') ? "bg-rose-50" : "bg-purple-50"
                )}>
                   {task.title.includes('书') ? 
                      <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" /> :
                      <Lightbulb className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                   }
                   <p className={cn(
                     "text-xs leading-relaxed",
                     task.title.includes('书') ? "text-rose-600" : "text-purple-700"
                   )}>
                     {ctx.smartSuggestion}
                   </p>
                </div>
             )}
          </>
        )}
      </div>
    </div>
  );
}