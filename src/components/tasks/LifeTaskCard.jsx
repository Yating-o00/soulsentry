import React, { useState } from "react";
import { format, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, Clock, MapPin, Repeat, MoreHorizontal, 
  ShoppingBag, Zap, Navigation, 
  Briefcase, Heart, Package, Sun, Moon, Sunrise, Sunset,
  Droplets, Leaf, Flower, Coffee, Utensils,
  Car, Store, Home, AlertCircle, Timer,
  Sparkles, Lightbulb, CheckCircle2, Flag,
  Share2, Edit, Trash2, Calendar
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function LifeTaskCard({ 
  task, 
  onComplete, 
  onEdit,
  onShare,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection
}) {
  const [completed, setCompleted] = useState(task.status === 'completed');

  const handleComplete = (e) => {
    e.stopPropagation();
    setCompleted(!completed);
    onComplete && onComplete(task, !completed);
  };

  // --- Helper Functions for UI Logic ---

  // 1. Get Context Badges
  const getContextBadges = () => {
    const badges = [];
    
    // Location Badge
    if (task.location_reminder?.enabled) {
      badges.push({
        label: task.location_reminder.trigger_on === 'enter' ? '到达触发' : '离开触发',
        icon: <Navigation className="w-3 h-3" />,
        className: "bg-green-100 text-green-700 border-green-200"
      });
    }

    // Time/Habit Badges
    if (task.repeat_rule && task.repeat_rule !== 'none') {
        const time = task.reminder_time ? new Date(task.reminder_time) : new Date();
        const hour = time.getHours();
        let label = '日常习惯';
        let icon = <Repeat className="w-3 h-3" />;
        let className = "bg-blue-100 text-blue-700 border-blue-200";

        if (hour >= 5 && hour < 10) {
            label = '晨间习惯';
            icon = <Sun className="w-3 h-3" />;
            className = "bg-orange-100 text-orange-700 border-orange-200";
        } else if (hour >= 18 && hour < 23) {
            label = '晚间惯例';
            icon = <Moon className="w-3 h-3" />;
            className = "bg-indigo-100 text-indigo-700 border-indigo-200";
        }
        
        badges.push({ label, icon, className });
    }

    // Urgency/Deadline Badge
    if (task.end_time) {
        const end = new Date(task.end_time);
        const now = new Date();
        const diffHours = (end - now) / (1000 * 60 * 60);
        
        if (diffHours > 0 && diffHours < 24) {
            badges.push({
                label: '即将超时',
                icon: <Timer className="w-3 h-3" />,
                className: "bg-amber-100 text-amber-700 border-amber-200"
            });
        }
    }

    // Package/Delivery specific
    if (task.title?.includes('快递') || task.title?.includes('包裹') || task.title?.includes('取件')) {
        badges.push({
            label: '待取件',
            icon: <Package className="w-3 h-3" />,
            className: "bg-purple-100 text-purple-700 border-purple-200"
        });
    }

    return badges;
  };

  // 2. Get Dynamic Icon & Theme
  const getTaskVisuals = () => {
    const title = task.title?.toLowerCase() || '';
    const cat = task.category;
    
    let icon = <Check className="w-6 h-6" />;
    let bgGradient = "from-slate-100 to-slate-50";
    let iconColor = "text-slate-600";
    let emoji = null;

    // Keyword matching for specific icons
    if (title.includes('油') || title.includes('超市') || title.includes('买')) {
        icon = <ShoppingBag className="w-6 h-6" />;
        bgGradient = "from-green-100 to-green-50";
        iconColor = "text-green-600";
        emoji = title.includes('油') ? '🛢️' : '🛒';
    } else if (title.includes('花') || title.includes('植物') || title.includes('水')) {
        icon = <Flower className="w-6 h-6" />;
        bgGradient = "from-rose-100 to-rose-50";
        iconColor = "text-rose-600";
        emoji = '🌱';
    } else if (title.includes('快递') || title.includes('包裹')) {
        icon = <Package className="w-6 h-6" />;
        bgGradient = "from-purple-100 to-purple-50";
        iconColor = "text-purple-600";
        emoji = '📦';
    } else if (title.includes('药') || title.includes('医院')) {
        icon = <Heart className="w-6 h-6" />;
        bgGradient = "from-red-100 to-red-50";
        iconColor = "text-red-600";
        emoji = '💊';
    } else if (title.includes('咖啡') || title.includes('茶')) {
        icon = <Coffee className="w-6 h-6" />;
        bgGradient = "from-amber-100 to-amber-50";
        iconColor = "text-amber-600";
        emoji = '☕';
    } else if (title.includes('车') || title.includes('加油')) {
        icon = <Car className="w-6 h-6" />;
        bgGradient = "from-blue-100 to-blue-50";
        iconColor = "text-blue-600";
        emoji = '🚗';
    } else if (cat === 'work') {
        icon = <Briefcase className="w-6 h-6" />;
        bgGradient = "from-blue-100 to-blue-50";
        iconColor = "text-blue-600";
        emoji = '📝';
    } else if (cat === 'study') {
         icon = <Briefcase className="w-6 h-6" />; // Use generic for study if no specific icon
         bgGradient = "from-indigo-100 to-indigo-50";
         iconColor = "text-indigo-600";
         emoji = '📚';
    }

    return { icon, bgGradient, iconColor, emoji };
  };

  // 3. Get Time/Status Text
  const getTimeStatus = () => {
    if (completed) return { text: '已完成', color: 'text-stone-400 font-medium' };
    
    // Determine the target date (deadline or reminder)
    const targetDateStr = task.end_time || task.reminder_time;
    if (!targetDateStr) return { text: '', color: 'text-stone-300' };

    const targetDate = new Date(targetDateStr);
    
    if (isToday(targetDate)) return { text: '今天', color: 'text-green-600 font-bold' };
    if (isTomorrow(targetDate)) return { text: '明天', color: 'text-stone-500 font-medium' };
    
    const now = new Date();
    // Reset hours to compare dates only
    const target = new Date(targetDate);
    target.setHours(0,0,0,0);
    const current = new Date();
    current.setHours(0,0,0,0);
    
    const diffTime = target - current;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: '已过期', color: 'text-red-500 font-bold' };
    if (diffDays <= 3) return { text: `剩${diffDays}天`, color: 'text-amber-500 font-bold' };
    
    return { text: format(targetDate, 'MM-dd'), color: 'text-stone-400' };
  };

  const badges = getContextBadges();
  const visuals = getTaskVisuals();
  const timeStatus = getTimeStatus();

  return (
    <div 
      onClick={(e) => {
        if (e.target.closest('button')) return;
        if (isSelectionMode) {
          e.stopPropagation();
          onToggleSelection && onToggleSelection();
        } else {
          onEdit && onEdit();
        }
      }}
      className={cn(
        "group bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
        completed && "opacity-60",
        isSelected && "ring-2 ring-blue-500 bg-blue-50/10"
      )}
    >
        {/* Selection Checkbox Overlay */}
        {isSelectionMode && (
             <div className="absolute top-4 left-4 z-30" onClick={(e) => e.stopPropagation()}>
                <div 
                    onClick={onToggleSelection}
                    className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer",
                        isSelected ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"
                    )}
                >
                    {isSelected && <Check className="w-4 h-4 text-white" />}
                </div>
             </div>
        )}

        {/* Decorative Background Blob */}
        <div className={cn(
            "absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl -mr-20 -mt-20 opacity-40 pointer-events-none transition-colors duration-500",
            task.category === 'work' ? "bg-blue-100" :
            task.category === 'health' ? "bg-rose-100" :
            task.category === 'family' ? "bg-purple-100" :
            "bg-green-100"
        )} />

        <div className={cn("relative z-10", isSelectionMode && "pl-8")}>
            
            {/* 1. Top Context Row: Badges & Menu */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Category Badge */}
                    <span className={cn(
                        "px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 border",
                        task.category === 'work' ? "bg-blue-50 text-blue-700 border-blue-100" :
                        task.category === 'health' ? "bg-rose-50 text-rose-700 border-rose-100" :
                        "bg-stone-50 text-stone-600 border-stone-100"
                    )}>
                        {task.category === 'work' ? <Briefcase className="w-3 h-3" /> :
                         task.category === 'health' ? <Heart className="w-3 h-3" /> :
                         <Zap className="w-3 h-3" />}
                        {task.category === 'work' ? '工作' : 
                         task.category === 'health' ? '健康' : '生活'}
                    </span>

                    {/* Dynamic Context Badges */}
                    {badges.map((badge, idx) => (
                        <span key={idx} className={cn(
                            "px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 border",
                            badge.className
                        )}>
                            {badge.icon}
                            {badge.label}
                        </span>
                    ))}
                </div>

                {/* Dropdown Menu */}
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
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShare && onShare(); }}>
                            <Share2 className="w-4 h-4 mr-2" /> 分享
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit && onEdit(); }}>
                            <Edit className="w-4 h-4 mr-2" /> 编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); /* onDelete */ }}>
                            <Trash2 className="w-4 h-4 mr-2" /> 删除
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* 2. Main Content Row */}
            <div className="flex gap-5 mb-4">
                {/* Large Icon */}
                <div className="flex-shrink-0 pt-1">
                    <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm border border-white/50 bg-gradient-to-br",
                        visuals.bgGradient
                    )}>
                        {visuals.emoji || visuals.icon}
                    </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                    <h3 className={cn(
                        "text-base font-bold text-stone-800 mb-1.5 truncate leading-tight",
                        completed && "line-through text-stone-400"
                    )}>
                        {task.title}
                    </h3>
                    
                    <p className={cn(
                        "text-sm text-stone-500 mb-3 leading-relaxed",
                        task.category === 'work' ? "line-clamp-4" : "line-clamp-2"
                    )}>
                        {task.description || "暂无描述"}
                    </p>

                    {/* Work Task Expanded Metadata */}
                    {task.category === 'work' && (
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            {/* Date Range */}
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-stone-50 text-stone-600 text-xs border border-stone-100">
                                <Clock className="w-3 h-3 text-stone-400" />
                                {task.reminder_time ? format(new Date(task.reminder_time), 'MM月dd日 HH:mm') : '待定'}
                                {task.end_time && ` - ${format(new Date(task.end_time), 'MM月dd日 HH:mm')}`}
                            </span>

                            {/* Recurrence */}
                            {task.repeat_rule !== 'none' && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-600 text-xs border border-blue-100">
                                    <Repeat className="w-3 h-3" />
                                    {task.repeat_rule === 'daily' ? '每天' : 
                                     task.repeat_rule === 'weekly' ? '每周' : 
                                     task.repeat_rule === 'monthly' ? '每月' : '循环'}
                                </span>
                            )}

                            {/* Priority */}
                            <span className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border",
                                task.priority === 'high' || task.priority === 'urgent' 
                                    ? "bg-red-50 text-red-600 border-red-100" 
                                    : "bg-stone-50 text-stone-600 border-stone-100"
                            )}>
                                <Flag className="w-3 h-3" />
                                {task.priority === 'urgent' ? '紧急' : 
                                 task.priority === 'high' ? '高' : 
                                 task.priority === 'low' ? '低' : '中'}
                            </span>

                            {/* AI Suggestion Badge */}
                            {task.ai_analysis?.suggested_priority === 'urgent' && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-600 text-white text-xs border border-purple-600 shadow-sm shadow-purple-200">
                                    <Sparkles className="w-3 h-3" />
                                    建议: 紧急
                                </span>
                            )}

                             {/* Advance Reminder */}
                             {task.advance_reminders?.length > 0 && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-50 text-cyan-600 text-xs border border-cyan-100">
                                    <AlertCircle className="w-3 h-3" />
                                    提前{task.advance_reminders.length}次
                                </span>
                            )}
                        </div>
                    )}

                    {/* Detailed Context Info Line (Non-Work Tasks or Supplemental) */}
                    {task.category !== 'work' && (
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                             {/* Location or Time Detail */}
                             <span className="flex items-center gap-1.5 text-stone-500 bg-stone-50 px-2 py-0.5 rounded-md">
                                {task.location_reminder?.enabled ? (
                                    <>
                                        <MapPin className="w-3.5 h-3.5 text-stone-400" />
                                        {task.location_reminder.location_name || "指定地点"}
                                    </>
                                ) : (
                                    <>
                                        <Clock className="w-3.5 h-3.5 text-stone-400" />
                                        {task.reminder_time ? format(new Date(task.reminder_time), 'HH:mm') : '全天'}
                                    </>
                                )}
                             </span>
                             
                             {/* Route/Distance or Streak Info */}
                             {task.location_reminder?.enabled ? (
                                 <span className="flex items-center gap-1.5 text-green-600 font-medium">
                                     <Navigation className="w-3.5 h-3.5" />
                                     回家顺路
                                 </span>
                             ) : task.repeat_rule !== 'none' ? (
                                 <span className="flex items-center gap-1.5 text-rose-500 font-medium">
                                     <Heart className="w-3.5 h-3.5" />
                                     已坚持 {Math.floor(Math.random() * 20) + 1} 天
                                 </span>
                             ) : null}

                             {/* Duration/Estimate */}
                             {task.estimated_duration && (
                                 <span className="flex items-center gap-1.5 text-stone-400">
                                     <Timer className="w-3.5 h-3.5" />
                                     预计{task.estimated_duration}分钟
                                 </span>
                             )}
                        </div>
                    )}
                </div>

                {/* Completion Check & Time */}
                <div className="flex flex-col items-center justify-start gap-1 min-w-[3.5rem]">
                    <button 
                        onClick={handleComplete}
                        className={cn(
                            "w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-300 group relative",
                            completed 
                                ? "border-stone-200 bg-stone-50 text-stone-400" 
                                : "border-stone-200 bg-white hover:border-green-500 hover:bg-green-50/30 text-stone-300 hover:text-green-600"
                        )}
                    >
                         <Check className={cn(
                             "w-5 h-5 transition-all duration-300", 
                             completed ? "opacity-100 scale-100" : "opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100"
                         )} />
                    </button>
                    <span className={cn(
                        "text-[10px] whitespace-nowrap text-center",
                        timeStatus.color
                    )}>
                        {timeStatus.text}
                    </span>
                </div>
            </div>

            {/* 3. AI Smart Status Bar (Bottom) */}
            {!completed && (
                <div className={cn(
                    "mt-2 rounded-xl p-3 flex items-start gap-3 transition-colors",
                    task.category === 'work' ? "bg-indigo-50/60 border border-indigo-100" :
                    task.ai_analysis?.suggestions?.length > 0 ? "bg-purple-50/80 border border-purple-100" : 
                    task.location_reminder?.enabled ? "bg-green-50/80 border border-green-100" :
                    "bg-stone-50/80 border border-stone-100"
                )}>
                    {task.category === 'work' && task.ai_analysis ? (
                        <>
                            <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Sparkles className="w-3 h-3 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-indigo-800 leading-relaxed">
                                    {task.ai_analysis.status_summary || task.ai_analysis.suggestions?.[0] || "AI正在分析此工作任务..."}
                                </p>
                            </div>
                        </>
                    ) : task.location_reminder?.enabled ? (
                        <>
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 animate-pulse">
                                <Navigation className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-green-800">智能地理围栏已激活</p>
                                <p className="text-[10px] text-green-600 truncate">将在你离开当前位置或到达目的地附近时提醒</p>
                            </div>
                        </>
                    ) : task.ai_analysis?.suggestions?.[0] ? (
                        <>
                             <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                                <Sparkles className="w-4 h-4 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-purple-800">AI 智能建议</p>
                                <p className="text-[10px] text-purple-600 truncate">{task.ai_analysis.suggestions[0]}</p>
                            </div>
                        </>
                    ) : (
                         <>
                            <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0">
                                <Lightbulb className="w-4 h-4 text-stone-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-stone-700">智能助手守护中</p>
                                <p className="text-[10px] text-stone-500 truncate">根据你的习惯，建议在 {task.reminder_time ? format(new Date(task.reminder_time), 'HH:mm') : '稍后'} 处理</p>
                            </div>
                         </>
                    )}
                    
                    {/* Inline Actions - Only show for non-work or simple reminders to reduce clutter on work cards */}
                    {task.category !== 'work' && (
                        <div className="flex items-center gap-2 pl-2 border-l border-stone-200/50 self-center">
                            <button 
                                className="text-[10px] font-medium text-stone-500 hover:text-stone-800 px-2 py-1 rounded-md hover:bg-stone-200/50 transition-colors whitespace-nowrap"
                                onClick={(e) => { e.stopPropagation(); /* onSnooze */ }}
                            >
                                <Clock className="w-3 h-3 inline mr-1" />
                                推迟
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
}