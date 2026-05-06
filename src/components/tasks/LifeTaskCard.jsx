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
  Share2, Edit, Trash2, Calendar, ChevronDown, MessageSquare,
  Link2, StickyNote, Paperclip, Bell
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import TaskMemoryInsight from "@/components/memory/TaskMemoryInsight";
import MilestoneTimeEditor from "@/components/tasks/MilestoneTimeEditor";

export default function LifeTaskCard({ 
  task, 
  subtasks = [],
  commentCount = 0,
  onComplete, 
  onEdit,
  onShare,
  onToggleSubtask,
  onUpdateTask,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
  onViewTab
}) {
  const [completed, setCompleted] = useState(task.status === 'completed');
  const [expanded, setExpanded] = useState(false);

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
    const title = task.title || '';
    const cat = task.category;
    
    let icon = <Zap className="w-6 h-6" />;
    let bgGradient = "from-slate-100 to-slate-50";
    let iconColor = "text-slate-600";
    let emoji = null;

    // Keyword matching for specific icons
    if (/会议|开会|约见|见面/.test(title)) {
        emoji = '🤝'; bgGradient = "from-blue-100 to-blue-50"; iconColor = "text-blue-600";
    } else if (/书|阅读|读|看书|图书/.test(title)) {
        emoji = '📚'; bgGradient = "from-indigo-100 to-indigo-50"; iconColor = "text-indigo-600";
    } else if (/带|寄|快递|邮件|包裹|取件/.test(title)) {
        emoji = '📦'; bgGradient = "from-purple-100 to-purple-50"; iconColor = "text-purple-600";
    } else if (/油|超市|买|购物|商场/.test(title)) {
        emoji = '🛒'; bgGradient = "from-green-100 to-green-50"; iconColor = "text-green-600";
    } else if (/花|植物|浇/.test(title)) {
        emoji = '🌸'; bgGradient = "from-rose-100 to-rose-50"; iconColor = "text-rose-600";
    } else if (/药|医院|体检|吃药/.test(title)) {
        emoji = '💊'; bgGradient = "from-red-100 to-red-50"; iconColor = "text-red-600";
    } else if (/咖啡|茶|喝水/.test(title)) {
        emoji = '☕'; bgGradient = "from-amber-100 to-amber-50"; iconColor = "text-amber-600";
    } else if (/车|加油|驾/.test(title)) {
        emoji = '🚗'; bgGradient = "from-blue-100 to-blue-50"; iconColor = "text-blue-600";
    } else if (/跑步|运动|健身|锻炼|瑜伽/.test(title)) {
        emoji = '🏃'; bgGradient = "from-emerald-100 to-emerald-50"; iconColor = "text-emerald-600";
    } else if (/做饭|烹饪|煮|下厨|菜/.test(title)) {
        emoji = '🍳'; bgGradient = "from-orange-100 to-orange-50"; iconColor = "text-orange-600";
    } else if (/打扫|清洁|卫生|洗|整理/.test(title)) {
        emoji = '🧹'; bgGradient = "from-teal-100 to-teal-50"; iconColor = "text-teal-600";
    } else if (/旅行|出行|出发|机票|酒店|飞/.test(title)) {
        emoji = '✈️'; bgGradient = "from-sky-100 to-sky-50"; iconColor = "text-sky-600";
    } else if (/电影|看剧|追剧|视频/.test(title)) {
        emoji = '🎬'; bgGradient = "from-violet-100 to-violet-50"; iconColor = "text-violet-600";
    } else if (/音乐|听歌|弹琴|唱/.test(title)) {
        emoji = '🎵'; bgGradient = "from-pink-100 to-pink-50"; iconColor = "text-pink-600";
    } else if (/睡|休息|午休|早起/.test(title)) {
        emoji = '😴'; bgGradient = "from-indigo-100 to-indigo-50"; iconColor = "text-indigo-600";
    } else if (/电话|打电话|联系|沟通|打给/.test(title)) {
        emoji = '📞'; bgGradient = "from-green-100 to-green-50"; iconColor = "text-green-600";
    } else if (/写|笔记|日记|作业/.test(title)) {
        emoji = '✍️'; bgGradient = "from-slate-100 to-slate-50"; iconColor = "text-slate-600";
    } else if (/遛狗|宠物|猫|狗/.test(title)) {
        emoji = '🐾'; bgGradient = "from-amber-100 to-amber-50"; iconColor = "text-amber-600";
    } else if (/报告|文档|PPT|方案|项目/.test(title)) {
        emoji = '📝'; bgGradient = "from-blue-100 to-blue-50"; iconColor = "text-blue-600";
    } else if (/提醒|备忘/.test(title)) {
        emoji = '🔔'; bgGradient = "from-amber-100 to-amber-50"; iconColor = "text-amber-600";
    } else if (cat === 'work') {
        emoji = '📝'; bgGradient = "from-blue-100 to-blue-50"; iconColor = "text-blue-600";
    } else if (cat === 'study') {
        emoji = '📖'; bgGradient = "from-indigo-100 to-indigo-50"; iconColor = "text-indigo-600";
    } else if (cat === 'health') {
        emoji = '🌱'; bgGradient = "from-emerald-100 to-emerald-50"; iconColor = "text-emerald-600";
    } else if (cat === 'family') {
        emoji = '👨‍👩‍👧'; bgGradient = "from-rose-100 to-rose-50"; iconColor = "text-rose-600";
    } else if (cat === 'shopping') {
        emoji = '🛍️'; bgGradient = "from-purple-100 to-purple-50"; iconColor = "text-purple-600";
    } else if (cat === 'finance') {
        emoji = '💰'; bgGradient = "from-amber-100 to-amber-50"; iconColor = "text-amber-600";
    } else {
        emoji = '⚡'; bgGradient = "from-green-100 to-green-50"; iconColor = "text-green-600";
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
        } else if (subtasks.length > 0) {
          setExpanded(!expanded);
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
                    {task.dependencies?.length > 0 && (
                        <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("dependencies"); }} className="px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 border bg-amber-50 text-amber-600 border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors">
                            <Link2 className="w-3 h-3" />
                            {task.dependencies.length}
                        </span>
                    )}
                    {task.attachments?.length > 0 && (
                        <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("attachments"); }} className="px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 border bg-purple-50 text-purple-600 border-purple-100 cursor-pointer hover:bg-purple-100 transition-colors">
                            <Paperclip className="w-3 h-3" />
                            {task.attachments.length}
                        </span>
                    )}
                    {task.notes?.length > 0 && (
                        <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("notes"); }} className="px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 border bg-teal-50 text-teal-600 border-teal-100 cursor-pointer hover:bg-teal-100 transition-colors">
                            <StickyNote className="w-3 h-3" />
                            {task.notes.length}
                        </span>
                    )}
                    {commentCount > 0 && (
                        <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("comments"); }} className="px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 border bg-blue-50 text-blue-600 border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors">
                            <MessageSquare className="w-3 h-3" />
                            {commentCount}
                        </span>
                    )}
                    {(task.advance_reminders?.length > 0 || task.persistent_reminder) && (
                        <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("reminders"); }} className="px-2.5 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 border bg-orange-50 text-orange-600 border-orange-100 cursor-pointer hover:bg-orange-100 transition-colors">
                            <Bell className="w-3 h-3" />
                        </span>
                    )}
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
                            {onUpdateTask ? (
                                <MilestoneTimeEditor
                                    task={task}
                                    onSave={(patch) => onUpdateTask(task, patch)}
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-stone-50 hover:bg-stone-100 text-stone-600 text-xs border border-stone-100 hover:border-stone-200 transition-colors cursor-pointer"
                                        title="点击调整时间"
                                    >
                                        <Clock className="w-3 h-3 text-stone-400" />
                                        {task.reminder_time ? format(new Date(task.reminder_time), 'MM月dd日 HH:mm') : '待定'}
                                        {task.end_time && ` - ${format(new Date(task.end_time), 'MM月dd日 HH:mm')}`}
                                    </button>
                                </MilestoneTimeEditor>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-stone-50 text-stone-600 text-xs border border-stone-100">
                                    <Clock className="w-3 h-3 text-stone-400" />
                                    {task.reminder_time ? format(new Date(task.reminder_time), 'MM月dd日 HH:mm') : '待定'}
                                    {task.end_time && ` - ${format(new Date(task.end_time), 'MM月dd日 HH:mm')}`}
                                </span>
                            )}

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

                    {/* AI Memory Insight */}
                    <TaskMemoryInsight task={task} />

                     {/* Detailed Context Info Line (Non-Work Tasks or Supplemental) */}
                    {task.category !== 'work' && (
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                             {/* Location or Time Detail (time is click-to-edit) */}
                             {task.location_reminder?.enabled ? (
                                <span className="flex items-center gap-1.5 text-stone-500 bg-stone-50 px-2 py-0.5 rounded-md">
                                    <MapPin className="w-3.5 h-3.5 text-stone-400" />
                                    {task.location_reminder.location_name || "指定地点"}
                                </span>
                             ) : onUpdateTask ? (
                                <MilestoneTimeEditor
                                    task={task}
                                    onSave={(patch) => onUpdateTask(task, patch)}
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-1.5 text-stone-600 bg-stone-50 hover:bg-stone-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer border border-transparent hover:border-stone-200"
                                        title="点击调整时间"
                                    >
                                        <Clock className="w-3.5 h-3.5 text-stone-400" />
                                        {(() => {
                                            if (task.reminder_time && task.end_time) {
                                                const start = new Date(task.reminder_time);
                                                const end = new Date(task.end_time);
                                                const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
                                                return sameDay
                                                    ? `${format(start, 'MM-dd HH:mm')} → ${format(end, 'HH:mm')}`
                                                    : `${format(start, 'MM-dd HH:mm')} → ${format(end, 'MM-dd HH:mm')}`;
                                            }
                                            if (task.end_time) return `截止 ${format(new Date(task.end_time), 'MM-dd HH:mm')}`;
                                            if (task.reminder_time) return format(new Date(task.reminder_time), 'HH:mm');
                                            return '全天';
                                        })()}
                                    </button>
                                </MilestoneTimeEditor>
                             ) : (
                                <span className="flex items-center gap-1.5 text-stone-500 bg-stone-50 px-2 py-0.5 rounded-md">
                                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                                    {task.reminder_time ? format(new Date(task.reminder_time), 'HH:mm') : '全天'}
                                </span>
                             )}
                             
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
                    "mt-3 rounded-2xl px-3.5 py-2.5 flex items-center gap-3 transition-all duration-300 relative group/statusbar backdrop-blur-sm",
                    task.location_reminder?.enabled ? "bg-gradient-to-r from-emerald-50/80 to-green-50/40 border border-emerald-100/70 hover:border-emerald-200" :
                    (task.ai_analysis?.status_summary || task.ai_analysis?.suggestions?.length > 0) ?
                        (task.category === 'work'
                            ? "bg-gradient-to-r from-indigo-50/70 to-blue-50/30 border border-indigo-100/70 hover:border-indigo-200"
                            : "bg-gradient-to-r from-purple-50/70 to-fuchsia-50/30 border border-purple-100/70 hover:border-purple-200") :
                    "bg-gradient-to-r from-stone-50/80 to-stone-50/30 border border-stone-100 hover:border-stone-200"
                )}>
                    {/* Icon & Content Logic */}
                    {(() => {
                        if (task.location_reminder?.enabled) {
                            return (
                                <>
                                    <div className="relative flex-shrink-0">
                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-sm shadow-emerald-500/20">
                                            <Navigation className="w-4 h-4 text-white" />
                                        </div>
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-emerald-900 tracking-tight">地理围栏守护中</p>
                                        <p className="text-[11px] text-emerald-700/80 truncate leading-relaxed">离开或到达目的地时自动提醒</p>
                                    </div>
                                </>
                            );
                        }
                        
                        // Check for AI Analysis
                        const aiContent = task.ai_analysis?.status_summary || task.ai_analysis?.suggestions?.[0];
                        if (aiContent) {
                            const isWork = task.category === 'work';
                            return (
                                <>
                                    <div className={cn(
                                        "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm",
                                        isWork
                                            ? "bg-gradient-to-br from-indigo-400 to-blue-500 shadow-indigo-500/20"
                                            : "bg-gradient-to-br from-purple-400 to-fuchsia-500 shadow-purple-500/20"
                                    )}>
                                        <Sparkles className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn("text-xs font-semibold tracking-tight", isWork ? "text-indigo-900" : "text-purple-900")}>
                                            {task.ai_analysis?.status_summary ? "AI 洞察" : "AI 建议"}
                                        </p>
                                        <p className={cn("text-[11px] truncate leading-relaxed", isWork ? "text-indigo-700/80" : "text-purple-700/80")}>
                                            {aiContent}
                                        </p>
                                    </div>
                                </>
                            );
                        }

                        // Default
                        return (
                            <>
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center flex-shrink-0">
                                    <Lightbulb className="w-4 h-4 text-stone-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-stone-800 tracking-tight">智能助手守护中</p>
                                    <p className="text-[11px] text-stone-500 truncate leading-relaxed">
                                        建议在 {task.reminder_time ? format(new Date(task.reminder_time), 'HH:mm') : '稍后'} 处理
                                    </p>
                                </div>
                            </>
                        );
                    })()}

                    {/* Right Action - Snooze */}
                    <button
                        className="flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-900 px-2.5 py-1.5 rounded-lg hover:bg-white/70 active:scale-95 transition-all whitespace-nowrap flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); /* onSnooze */ }}
                    >
                        <Clock className="w-3 h-3" />
                        推迟
                    </button>
                </div>
            )}

            {/* Subtasks Section */}
            {subtasks.length > 0 && (
              <div className={cn(
                "border-t border-stone-100 transition-all duration-300 ease-in-out overflow-hidden mt-3",
                expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 mt-0 border-t-0"
              )}>
                <div className="pt-3 space-y-2">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSubtask && onToggleSubtask(subtask);
                      }}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all bg-stone-50 border border-stone-100 hover:border-stone-300",
                        subtask.status === 'completed' && "opacity-60"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors border",
                        subtask.status === 'completed'
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-stone-300 bg-white"
                      )}>
                        {subtask.status === 'completed' && <Check className="w-3 h-3" />}
                      </div>
                      <span className={cn(
                        "text-sm flex-1",
                        subtask.status === 'completed' ? "text-stone-400 line-through" : "text-stone-700"
                      )}>
                        {subtask.title}
                      </span>
                    </div>
                  ))}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit && onEdit();
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    查看详情
                  </button>
                </div>
              </div>
            )}

            {/* Expand hint */}
            {!expanded && subtasks.length > 0 && (
              <div className="flex justify-center pt-2">
                <div className="flex items-center gap-1 text-xs text-stone-400">
                  <span>{subtasks.filter(s => s.status === 'completed').length}/{subtasks.length} 子任务</span>
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>
            )}
        </div>
    </div>
  );
}