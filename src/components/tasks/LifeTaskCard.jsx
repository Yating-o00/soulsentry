import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, 
  Clock, 
  MapPin, 
  Repeat, 
  AlertCircle, 
  MoreHorizontal, 
  ShoppingBag, 
  Zap, 
  Calendar 
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function LifeTaskCard({ 
  task, 
  onComplete, 
  onEdit 
}) {
  const [completed, setCompleted] = useState(task.status === 'completed');

  const handleComplete = () => {
    setCompleted(!completed);
    onComplete(task, !completed);
  };

  const getTriggerIcon = () => {
    if (task.location_reminder?.enabled) return <MapPin className="w-3 h-3" />;
    if (task.repeat_rule !== 'none') return <Repeat className="w-3 h-3" />;
    return <Clock className="w-3 h-3" />;
  };

  const getTriggerText = () => {
    if (task.location_reminder?.enabled) return "地点触发";
    if (task.repeat_rule !== 'none') return "每日习惯";
    return "时间触发";
  };

  const getTriggerColor = () => {
    if (task.location_reminder?.enabled) return "text-green-700 bg-green-50 border-green-200";
    if (task.priority === 'urgent') return "text-rose-700 bg-rose-50 border-rose-200";
    return "text-amber-700 bg-amber-50 border-amber-200";
  };

  const getCategoryIcon = () => {
    switch (task.category) {
      case 'shopping': return <ShoppingBag className="w-6 h-6" />;
      case 'health': return <Zap className="w-6 h-6" />;
      default: return <Calendar className="w-6 h-6" />;
    }
  };

  return (
    <div 
      onClick={(e) => {
        // Prevent edit if clicking buttons
        if (e.target.closest('button')) return;
        onEdit && onEdit();
      }}
      className={cn(
      "life-card p-5 relative overflow-hidden transition-all duration-300 transform cursor-pointer",
      completed ? "opacity-60 scale-95 grayscale" : "bg-white hover:-translate-y-1 hover:shadow-lg",
      "rounded-[20px] border-l-4 border-[#7FB069] shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
    )}>
      {/* Trigger Badge */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[11px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border",
            getTriggerColor()
          )}>
            {getTriggerIcon()}
            {getTriggerText()}
          </span>
          {task.reminder_time && (
            <span className="text-xs text-stone-400">
              {format(new Date(task.reminder_time), 'HH:mm', { locale: zhCN })}
            </span>
          )}
        </div>
        <button className="p-1.5 hover:bg-stone-50 rounded-lg text-stone-400 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#E8D5C4]/20 flex items-center justify-center text-[#7FB069] flex-shrink-0">
          {getCategoryIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            "font-semibold text-[#2C3E50] mb-1 truncate",
            completed && "line-through text-stone-400"
          )}>
            {task.title}
          </h4>
          <p className="text-sm text-stone-500 mb-3 line-clamp-2">
            {task.description || "暂无描述"}
          </p>
          
          {task.location_reminder?.location_name && (
            <div className="flex items-center gap-2 text-xs text-stone-400 mb-3">
              <MapPin className="w-3 h-3" />
              <span>{task.location_reminder.location_name}</span>
            </div>
          )}
          
          {/* AI Hint */}
          {!completed && (
             <div className="bg-gradient-to-br from-[#A8B5A0]/10 to-transparent border-l-[3px] border-[#A8B5A0] px-3 py-2 rounded-r-lg flex items-start gap-2 mt-2">
               <AlertCircle className="w-3.5 h-3.5 text-[#7FB069] mt-0.5 flex-shrink-0" />
               <p className="text-xs text-[#5B8DB8] leading-relaxed">
                 AI已协调：利用碎片时间，不干扰深度工作
               </p>
             </div>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
        <span className="text-xs text-stone-400">
          {task.reminder_time ? format(new Date(task.reminder_time), 'EEE', { locale: zhCN }) : '今天'}
        </span>
        <button 
          onClick={handleComplete}
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300",
            completed 
              ? "bg-[#A8B5A0] border-[#A8B5A0] text-white" 
              : "border-[#E8E4E0] hover:border-[#7FB069] hover:bg-[#7FB069]/10 text-stone-300 hover:text-[#7FB069]"
          )}
        >
          <Check className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}