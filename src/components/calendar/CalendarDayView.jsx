import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, startOfWeek, addDays, parseISO, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, Plus, ChevronDown, ChevronRight, Target, Calendar as CalendarIcon, Zap, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { shouldTaskAppearAtDateTime } from "@/components/utils/recurrenceHelper";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const CATEGORY_STYLES = {
  work: "bg-blue-50 text-blue-700 border-l-4 border-l-blue-500",
  personal: "bg-indigo-50 text-indigo-700 border-l-4 border-l-indigo-500",
  health: "bg-emerald-50 text-emerald-700 border-l-4 border-l-emerald-500",
  study: "bg-amber-50 text-amber-700 border-l-4 border-l-amber-500",
  family: "bg-rose-50 text-rose-700 border-l-4 border-l-rose-500",
  shopping: "bg-orange-50 text-orange-700 border-l-4 border-l-orange-500",
  finance: "bg-slate-100 text-slate-700 border-l-4 border-l-slate-500",
  other: "bg-slate-50 text-slate-600 border-l-4 border-l-slate-400",
};

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 to 23:00

export default function CalendarDayView({ 
  currentDate, 
  tasks, 
  notes, 
  onDateClick, 
  onTaskDrop,
  onTaskClick,
  onCreateSubtask
}) {
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  
  // Fetch Weekly Plan Context
  const weekStart = startOfWeek(currentDate, { locale: zhCN, weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  
  const { data: weeklyPlans } = useQuery({
    queryKey: ['weeklyPlan', weekStartStr],
    queryFn: () => base44.entities.WeeklyPlan.filter({ week_start_date: weekStartStr }),
    staleTime: 5 * 60 * 1000
  });

  const weeklyContext = useMemo(() => {
    if (!weeklyPlans || weeklyPlans.length === 0) return null;
    const plan = weeklyPlans[0];
    
    // Find today's specific plan from events
    const currentDayStr = format(currentDate, 'yyyy-MM-dd');
    const dayIndex = [0, 1, 2, 3, 4, 5, 6].find(i => 
        format(addDays(weekStart, i), 'yyyy-MM-dd') === currentDayStr
    );
    
    const dayEvents = plan.plan_json?.events?.filter(e => {
        if (e.date) return e.date === currentDayStr;
        return e.day_index === dayIndex;
    }) || [];

    return {
        theme: plan.theme,
        summary: plan.summary,
        dayEvents,
        stats: plan.plan_json?.stats
    };
  }, [weeklyPlans, currentDate, weekStart]);

  const getItemsForHour = (hour) => {
    return tasks.filter(task => {
      if (!task.reminder_time || task.parent_task_id) return false;
      return shouldTaskAppearAtDateTime(task, currentDate, hour);
    });
  };

  const isTaskFirstHour = (task, hour) => {
    if (!task.reminder_time) return false;
    const taskStart = new Date(task.reminder_time);
    return taskStart.getHours() === hour;
  };

  const getSubtasks = (parentId) => {
    return tasks.filter(task => task.parent_task_id === parentId);
  };

  const toggleTaskExpand = (taskId) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const taskId = result.draggableId;
    const dropId = result.destination.droppableId;
    
    if (dropId.startsWith('hour_')) {
        const hour = parseInt(dropId.split('_')[1]);
        const destinationDate = new Date(currentDate);
        destinationDate.setHours(hour, 0, 0, 0);
        onTaskDrop(taskId, destinationDate);
    }
  };

  const dayNotes = notes.filter(note => 
    isSameDay(new Date(note.created_date), currentDate)
  );
  
  const isCurrentDay = isToday(currentDate);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-200px)] bg-slate-50/50 rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
      {/* Sidebar: Context & Overview */}
      <div className="w-full lg:w-80 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/30">
            <div className="flex items-baseline gap-3 mb-1">
                <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
                    {format(currentDate, "d")}
                </h2>
                <span className="text-lg font-medium text-slate-500">
                    {format(currentDate, "EEEE", { locale: zhCN })}
                </span>
                {isCurrentDay && (
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm shadow-blue-200">
                        Today
                    </span>
                )}
            </div>
            <p className="text-sm text-slate-400 font-medium">
                {format(currentDate, "yyyy年M月", { locale: zhCN })}
            </p>
        </div>

        <ScrollArea className="flex-1">
            <div className="p-5 space-y-6">
                {/* Weekly Context Card */}
                {weeklyContext ? (
                    <div className="bg-[#384877] rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-[#384877]/20">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <Target className="w-20 h-20" />
                        </div>
                        <div className="relative z-10">
                            <div className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Zap className="w-3 h-3" /> 周主题
                            </div>
                            <h3 className="text-lg font-bold leading-tight mb-3">
                                {weeklyContext.theme}
                            </h3>
                            
                            {weeklyContext.dayEvents.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                                    <div className="text-blue-200 text-xs font-medium">今日 AI 规划:</div>
                                    {weeklyContext.dayEvents.map((e, idx) => (
                                        <div key={idx} className="flex items-start gap-2 text-sm text-white/90">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                                            <span className="leading-relaxed">{e.title}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-center">
                        <p className="text-slate-400 text-sm">本周暂无 AI 规划</p>
                        <Button variant="link" className="text-[#384877] text-xs h-auto p-0 mt-1">
                            去生成规划 &rarr;
                        </Button>
                    </div>
                )}

                {/* Day Notes */}
                {dayNotes.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <StickyNote className="w-4 h-4 text-slate-400" />
                            <h3 className="text-sm font-bold text-slate-700">今日心签</h3>
                            <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-md ml-auto">
                                {dayNotes.length}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {dayNotes.slice(0, 3).map(note => (
                                <div key={note.id} className="p-3 rounded-xl bg-amber-50/50 border border-amber-100 text-amber-900/80 text-xs leading-relaxed line-clamp-3 hover:bg-amber-50 transition-colors">
                                    <div dangerouslySetInnerHTML={{ __html: note.content }} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </ScrollArea>
      </div>

      {/* Main Timeline */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-white to-transparent z-10" />
        
        <DragDropContext onDragEnd={handleDragEnd}>
            <ScrollArea className="flex-1">
                <div className="p-4 pb-20 max-w-4xl mx-auto">
                    {HOURS.map((hour) => {
                        const hourTasks = getItemsForHour(hour);
                        const dropId = `hour_${hour}`;
                        const isPastHour = isToday(currentDate) && hour < new Date().getHours();
                        const isCurrentHour = isToday(currentDate) && hour === new Date().getHours();

                        return (
                            <div key={hour} className="flex gap-4 group mb-2">
                                {/* Time Label */}
                                <div className="w-16 flex-shrink-0 text-right pt-2 relative">
                                    <span className={cn(
                                        "text-xs font-semibold font-mono",
                                        isCurrentHour ? "text-blue-600 scale-110 origin-right inline-block" : "text-slate-400",
                                        isPastHour && "opacity-50"
                                    )}>
                                        {hour.toString().padStart(2, '0')}:00
                                    </span>
                                    {isCurrentHour && (
                                        <div className="absolute right-[-21px] top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white z-20 shadow-sm" />
                                    )}
                                </div>

                                {/* Timeline Track */}
                                <Droppable droppableId={dropId}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            onClick={() => {
                                                const clickDate = new Date(currentDate);
                                                clickDate.setHours(hour, 0, 0, 0);
                                                onDateClick(clickDate);
                                            }}
                                            className={cn(
                                                "flex-1 min-h-[80px] rounded-xl border transition-all duration-200 relative",
                                                snapshot.isDraggingOver ? "bg-blue-50 border-blue-300 border-dashed" : "border-slate-100 hover:border-slate-200 hover:shadow-sm",
                                                isCurrentHour ? "bg-blue-50/10 border-blue-100" : "bg-white",
                                                // Grid lines
                                                "before:absolute before:left-0 before:right-0 before:top-4 before:h-px before:bg-slate-50 before:-z-10"
                                            )}
                                        >
                                            {isCurrentHour && (
                                                <div className="absolute top-4 left-0 right-0 h-px bg-blue-200 z-0 pointer-events-none" />
                                            )}

                                            <div className="p-2 space-y-2 relative z-10">
                                                {hourTasks.map((task, index) => {
                                                    const subtasks = getSubtasks(task.id);
                                                    const isExpanded = expandedTasks.has(task.id);
                                                    const isFirstHour = isTaskFirstHour(task, hour);

                                                    if (!isFirstHour) return null; // Only render at start time

                                                    return (
                                                        <Draggable key={task.id} draggableId={task.id} index={index}>
                                                            {(provided, snapshot) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    {...provided.dragHandleProps}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onTaskClick(task);
                                                                    }}
                                                                    className={cn(
                                                                        "group/card relative rounded-lg border shadow-sm transition-all overflow-hidden",
                                                                        CATEGORY_STYLES[task.category] || CATEGORY_STYLES.other,
                                                                        snapshot.isDragging ? "shadow-xl rotate-1 scale-105 z-50 bg-white ring-2 ring-blue-500 border-transparent" : "hover:shadow-md",
                                                                        task.status === 'completed' && "opacity-60 grayscale bg-slate-50 border-slate-200"
                                                                    )}
                                                                >
                                                                    <div className="p-3">
                                                                        <div className="flex items-start justify-between gap-2">
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                                                                                    <h4 className={cn(
                                                                                        "font-semibold text-sm truncate",
                                                                                        task.status === 'completed' && "line-through text-slate-500"
                                                                                    )}>{task.title}</h4>
                                                                                </div>
                                                                                <div className="flex items-center gap-3 text-xs opacity-80 font-medium">
                                                                                    <div className="flex items-center gap-1">
                                                                                        <Clock className="w-3 h-3" />
                                                                                        <span>
                                                                                            {format(new Date(task.reminder_time), "HH:mm")}
                                                                                            {task.end_time && ` - ${format(new Date(task.end_time), "HH:mm")}`}
                                                                                        </span>
                                                                                    </div>
                                                                                    {subtasks.length > 0 && (
                                                                                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white/50 rounded-md">
                                                                                            <span className="text-[10px]">{subtasks.filter(t => t.status === 'completed').length}/{subtasks.length}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            
                                                                            {subtasks.length > 0 && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        toggleTaskExpand(task.id);
                                                                                    }}
                                                                                    className="p-1 hover:bg-black/5 rounded-md transition-colors"
                                                                                >
                                                                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                                                </button>
                                                                            )}
                                                                        </div>

                                                                        {/* Subtasks Preview */}
                                                                        <AnimatePresence>
                                                                            {isExpanded && subtasks.length > 0 && (
                                                                                <motion.div
                                                                                    initial={{ height: 0, opacity: 0 }}
                                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                                    exit={{ height: 0, opacity: 0 }}
                                                                                    className="mt-3 pt-3 border-t border-black/5 space-y-1.5"
                                                                                >
                                                                                    {subtasks.map(sub => (
                                                                                        <div key={sub.id} className="flex items-center gap-2 text-xs opacity-90">
                                                                                            <div className={cn(
                                                                                                "w-1.5 h-1.5 rounded-full",
                                                                                                sub.status === 'completed' ? "bg-emerald-500" : "bg-current opacity-40"
                                                                                            )} />
                                                                                            <span className={cn(sub.status === 'completed' && "line-through opacity-60")}>
                                                                                                {sub.title}
                                                                                            </span>
                                                                                        </div>
                                                                                    ))}
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    );
                                                })}
                                                
                                                {/* Empty State / Add Hint */}
                                                {hourTasks.length === 0 && (
                                                    <div className={cn(
                                                        "h-full min-h-[60px] flex items-center justify-center text-xs text-slate-300 font-medium transition-opacity",
                                                        snapshot.isDraggingOver ? "opacity-0" : "opacity-0 hover:opacity-100"
                                                    )}>
                                                        <Plus className="w-4 h-4 mr-1" />
                                                        添加安排
                                                    </div>
                                                )}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </Droppable>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </DragDropContext>
      </div>
    </div>
  );
}