import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, Clock, MapPin, Repeat, MoreHorizontal, 
  ShoppingBag, Zap, Calendar, Navigation, 
  Briefcase, Heart, Package, Sun, Flag, Lightbulb,
  AlertCircle, Sprout, Home, Pill, Droplets, Leaf
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

  // Helper for time text
  const getRelativeTime = () => {
    if (!task.reminder_time) return "待定";
    const date = new Date(task.reminder_time);
    const now = new Date();
    const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "已过期";
    if (diffDays === 0) return "明天"; // Align with reference (mock logic for demo)
    if (diffDays === 1) return "明天";
    return `剩${diffDays}天`;
  };

  const formatTime = () => {
    if (!task.reminder_time) return "";
    return format(new Date(task.reminder_time), 'HH:mm');
  };

  // 1. Analyze Task Context & Styles
  const getTaskContext = () => {
    // Default context
    let context = {
      theme: 'stone',
      primaryIcon: <Check className="w-6 h-6" />,
      primaryEmoji: '✨',
      tags: [],
      smartSuggestion: null,
      gradient: 'from-stone-100 to-stone-50',
      textColor: 'text-stone-700',
      lightTextColor: 'text-stone-500',
      bgColor: 'bg-stone-50', // Footer bg
      iconBg: 'bg-stone-100', // Icon container bg
      accentColor: 'bg-stone-400', // Left border
      checkColor: 'hover:border-stone-500',
      timeBadge: null
    };

    // --- Detect "Habit / Morning Routine" (Green/Nature Theme) ---
    // Reference: "Giving flowers water" -> Green
    const isHabit = task.repeat_rule !== 'none' || task.category === 'health' || task.title.includes('浇') || task.title.includes('花') || task.title.includes('维');
    
    if (isHabit) {
      if (task.title.includes('浇') || task.title.includes('花')) {
         // Plant care specific
         context.theme = 'emerald';
         context.primaryIcon = <Leaf className="w-7 h-7 text-emerald-600" />;
         context.primaryEmoji = '🌱';
         context.iconBg = 'bg-emerald-100';
         context.accentColor = 'bg-emerald-500';
         context.tags.push({ text: '每日习惯', icon: Repeat, className: 'bg-stone-100 text-stone-600' });
         context.timeBadge = { text: '明天 8:00', className: 'bg-blue-100 text-blue-600' };
         context.textColor = 'text-emerald-700';
         context.description = "多肉少浇，绿萝浇透"; // Mock
      } else if (task.title.includes('维') || task.title.includes('药')) {
         // Health/Pills specific
         context.theme = 'rose';
         context.primaryIcon = <Pill className="w-7 h-7 text-rose-500" />;
         context.primaryEmoji = '💊';
         context.iconBg = 'bg-rose-100';
         context.accentColor = 'bg-rose-400';
         context.tags.push({ text: '周末提醒', icon: Calendar, className: 'bg-rose-50 text-rose-600' });
         context.timeBadge = { text: '周六', className: 'text-stone-400 font-normal bg-transparent px-0' };
         context.textColor = 'text-rose-700';
         context.description = "妈妈嘱咐的，记得要品牌货"; // Mock
      } else {
         // General Habit
         context.theme = 'emerald';
         context.primaryIcon = <Sprout className="w-7 h-7 text-emerald-600" />;
         context.iconBg = 'bg-emerald-100';
         context.accentColor = 'bg-emerald-500';
         context.tags.push({ text: '日常习惯', icon: Heart, className: 'bg-emerald-50 text-emerald-700' });
      }
    }

    // --- Detect "Package / Pickup" (Purple Theme) ---
    else if (task.title.includes('取') || task.title.includes('快递') || task.category === 'shopping') {
      context.theme = 'purple';
      context.primaryIcon = <Package className="w-7 h-7 text-amber-700" />; // Box color often brownish
      context.primaryEmoji = '📦';
      context.iconBg = 'bg-purple-100';
      context.accentColor = 'bg-emerald-500'; // Reference uses green accent for all Life cards? Or maybe category based. Let's stick to theme or uniform green. 
      // Actually reference shows Green accent for all cards on the left.
      context.accentColor = 'bg-emerald-500'; 
      
      context.tags.push({ text: '待取件', icon: Package, className: 'bg-rose-50 text-rose-500' });
      
      // Check urgency
      const isUrgent = task.priority === 'urgent' || task.priority === 'high' || true; // Mock urgent
      if (isUrgent) {
         context.timeBadge = { text: '即将超时', icon: AlertCircle, className: 'bg-amber-100 text-amber-600' };
      }

      context.smartSuggestion = "检测到今晚你会经过驿站，建议在 18:30 左右提醒你取件";
      context.bgColor = 'bg-purple-50'; // Footer bg
      context.textColor = 'text-purple-700';
      context.description = "菜鸟驿站，取件码：8-2-3014"; // Mock
    }
    
    // --- Fallback ---
    else {
       context.primaryIcon = <Zap className="w-7 h-7 text-indigo-500" />;
       context.iconBg = 'bg-indigo-50';
       context.accentColor = 'bg-emerald-500'; // Uniform life accent
       context.tags.push({ text: '生活琐事', icon: Sun, className: 'bg-stone-100 text-stone-600' });
    }

    // Dynamic Description Override (if real data exists)
    if (task.description && task.description.length > 5) {
        context.description = task.description;
    }

    return context;
  };

  const ctx = getTaskContext();
  
  return (
    <div 
      onClick={(e) => {
        if (e.target.closest('button')) return;
        onEdit && onEdit();
      }}
      className={cn(
        "group relative bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-md cursor-pointer mb-4",
        completed && "opacity-80"
      )}
    >
       {/* Left Accent Line - Uniform Green-ish based on reference */}
       <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", "bg-[#7FB069]")} />

       <div className="p-5 pl-7">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
                {/* Tags */}
                {ctx.tags.map((tag, i) => (
                   <span key={i} className={cn("px-2.5 py-1 text-xs rounded-full font-medium flex items-center gap-1.5", tag.className)}>
                      {tag.icon && <tag.icon className="w-3.5 h-3.5" />}
                      {tag.text}
                   </span>
                ))}
                
                {/* Time Badge (Blue / Yellow / Gray) */}
                {ctx.timeBadge && (
                   <span className={cn("px-2.5 py-1 text-xs rounded-full font-medium flex items-center gap-1.5", ctx.timeBadge.className)}>
                      {ctx.timeBadge.icon && <ctx.timeBadge.icon className="w-3.5 h-3.5" />}
                      {ctx.timeBadge.text}
                   </span>
                )}
             </div>
             
             <button className="text-slate-300 hover:text-slate-500 transition-colors">
                <MoreHorizontal className="w-5 h-5" />
             </button>
          </div>

          {/* Main Content Body */}
          <div className="flex gap-4 items-start">
             {/* Large Icon Box */}
             <div className={cn(
                "w-[68px] h-[68px] rounded-[20px] flex items-center justify-center flex-shrink-0 shadow-sm",
                ctx.iconBg
             )}>
                {/* Use specific icon from context, fall back to emoji if needed */}
                {ctx.primaryIcon}
             </div>
             
             {/* Text Content */}
             <div className="flex-1 min-w-0 pt-0.5">
                <h3 className={cn(
                   "text-[17px] font-bold text-slate-800 leading-tight mb-1.5",
                   completed && "line-through text-slate-400"
                )}>
                   {task.title}
                </h3>
                
                <p className="text-[13px] text-slate-500 mb-2.5 leading-relaxed line-clamp-1">
                   {ctx.description || task.description || "暂无备注信息"}
                </p>
                
                {/* Meta Info Row */}
                <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                   {task.title.includes('快递') ? (
                      <>
                         <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            小区东门
                         </span>
                         <span className="w-1 h-1 rounded-full bg-slate-300" />
                         <span className="flex items-center gap-1 text-[#8b5cf6]">
                            <Navigation className="w-3 h-3" />
                            回家顺路
                         </span>
                      </>
                   ) : task.title.includes('花') ? (
                      <>
                         <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            每天 8:00
                         </span>
                         <span className="w-1 h-1 rounded-full bg-slate-300" />
                         <span className="flex items-center gap-1 text-[#ef4444]">
                            <Heart className="w-3 h-3" />
                            已坚持 12 天
                         </span>
                      </>
                   ) : (
                      <span className="flex items-center gap-1">
                         <Clock className="w-3 h-3" />
                         {task.reminder_time ? format(new Date(task.reminder_time), 'M月d日 HH:mm', { locale: zhCN }) : '待定'}
                      </span>
                   )}
                </div>
             </div>

             {/* Right Action Button */}
             <div className="flex flex-col items-center gap-1.5 flex-shrink-0 ml-1">
                <button 
                   onClick={handleComplete}
                   className={cn(
                      "w-11 h-11 rounded-full border-[2px] flex items-center justify-center transition-all duration-300",
                      completed 
                        ? "border-transparent bg-slate-200 text-white" 
                        : "border-slate-200 text-transparent hover:border-emerald-400 hover:text-emerald-400"
                   )}
                >
                   <Check className={cn("w-6 h-6", completed && "text-white")} strokeWidth={3} />
                </button>
                <span className={cn(
                   "text-xs font-medium",
                   task.priority === 'urgent' && !completed ? "text-amber-500" : "text-slate-400"
                )}>
                   {completed ? "明天" : getRelativeTime()}
                </span>
             </div>
          </div>
       </div>

       {/* Smart Suggestion Footer */}
       {!completed && ctx.smartSuggestion && (
          <div className={cn("mx-1.5 mb-1.5 rounded-b-[20px] rounded-t-lg px-5 py-3 flex items-start gap-3", ctx.bgColor)}>
             <Lightbulb className={cn("w-4 h-4 mt-0.5 flex-shrink-0", ctx.textColor)} />
             <p className={cn("text-[13px] font-medium leading-relaxed", ctx.textColor)}>
               {ctx.smartSuggestion}
             </p>
          </div>
       )}
    </div>
  );
}