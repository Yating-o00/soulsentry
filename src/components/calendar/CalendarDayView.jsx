import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, startOfWeek, addDays, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, Plus, ChevronDown, ChevronRight, Target, Zap, CheckCircle2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shouldTaskAppearAtDateTime } from "@/components/utils/recurrenceHelper";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import DayPlanInput from "./DayPlanInput";
import DayPlanHeader from "./DayPlanHeader";
import DayPlanAppendInput from "./DayPlanAppendInput";
import ContextTimeline from "../dashboard/planner/ContextTimeline";

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

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

const PROCESSING_STEPS = [
  { icon: '📅', text: '解析时间与核心意图...' },
  { icon: '🎯', text: '提取关键事件与场景...' },
  { icon: '🗺️', text: '规划情境时间线...' },
  { icon: '⚡', text: '生成自动化执行方案...' },
  { icon: '✨', text: '编织当日情境网络...' }
];

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
  const dayStr = format(currentDate, 'yyyy-MM-dd');
  const queryClient = useQueryClient();

  // Stage: 'input' | 'processing' | 'results'
  const [stage, setStage] = useState('input');
  const [userInput, setUserInput] = useState('');
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAppendInput, setShowAppendInput] = useState(false);
  const [appendInput, setAppendInput] = useState('');
  const [isAppending, setIsAppending] = useState(false);

  // Fetch daily plan
  const { data: dayPlans, isLoading: loadingDayPlan } = useQuery({
    queryKey: ['dailyPlan', dayStr],
    queryFn: () => base44.entities.DailyPlan.filter({ plan_date: dayStr }),
    staleTime: 5 * 60 * 1000
  });
  const dayPlan = useMemo(() => (dayPlans && dayPlans.length > 0 ? dayPlans[0] : null), [dayPlans]);

  // Weekly plan context
  const weekStart = startOfWeek(currentDate, { locale: zhCN, weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const { data: weeklyPlans } = useQuery({
    queryKey: ['weeklyPlan', weekStartStr],
    queryFn: () => base44.entities.WeeklyPlan.filter({ week_start_date: weekStartStr }),
    staleTime: 5 * 60 * 1000
  });

  // Load existing plan into state when date changes
  useEffect(() => {
    if (loadingDayPlan) return;
    if (dayPlan && dayPlan.plan_json?.theme) {
      setUserInput(dayPlan.original_input || '');
      setStage('results');
    } else {
      setUserInput('');
      setStage('input');
    }
    setShowAppendInput(false);
    setAppendInput('');
  }, [dayStr, dayPlan?.id, loadingDayPlan]);

  const weeklyContext = useMemo(() => {
    if (!weeklyPlans || weeklyPlans.length === 0) return null;
    const plan = weeklyPlans[0];
    const currentDayStr = format(currentDate, 'yyyy-MM-dd');
    const dayIndex = [0,1,2,3,4,5,6].find(i => format(addDays(weekStart, i), 'yyyy-MM-dd') === currentDayStr);
    const dayEvents = plan.plan_json?.events?.filter(e => {
      if (e.date) return e.date === currentDayStr;
      return e.day_index === dayIndex;
    }) || [];
    return { theme: plan.theme, summary: plan.summary, dayEvents, stats: plan.plan_json?.stats };
  }, [weeklyPlans, currentDate, weekStart]);

  // Generate plan
  const handleProcess = async () => {
    if (!userInput.trim() || isProcessing) return;
    setStage('processing');
    setIsProcessing(true);
    setProcessingStepIndex(0);

    const stepInterval = setInterval(() => {
      setProcessingStepIndex(prev => (prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1500);

    try {
      const { data } = await base44.functions.invoke('generateDailyPlan', {
        input: userInput,
        planDate: dayStr
      });
      if (data) {
        clearInterval(stepInterval);
        setProcessingStepIndex(PROCESSING_STEPS.length - 1);
        // Save to DB
        const planData = {
          plan_date: dayStr,
          original_input: userInput,
          theme: data.theme,
          summary: data.summary,
          plan_json: data,
          is_active: true
        };
        if (dayPlan) {
          await base44.entities.DailyPlan.update(dayPlan.id, planData);
        } else {
          await base44.entities.DailyPlan.create(planData);
        }
        queryClient.invalidateQueries({ queryKey: ['dailyPlan', dayStr] });
        setTimeout(() => {
          setStage('results');
          setIsProcessing(false);
          toast.success("已生成当日规划");
        }, 600);
      }
    } catch (e) {
      console.error("Plan generation failed:", e);
      toast.error("规划生成失败");
      setStage('input');
      setIsProcessing(false);
      clearInterval(stepInterval);
    }
  };

  // Append content (merge)
  const handleAppend = async () => {
    if (!appendInput.trim() || !dayPlan) return;
    setIsAppending(true);
    try {
      const { data } = await base44.functions.invoke('generateDailyPlan', {
        input: appendInput,
        planDate: dayStr,
        existingPlan: dayPlan.plan_json
      });
      if (data) {
        const merged = {
          ...dayPlan.plan_json,
          ...data,
          focus_blocks: [
            ...(dayPlan.plan_json?.focus_blocks || []),
            ...(data.focus_blocks || []).filter(newB =>
              !(dayPlan.plan_json?.focus_blocks || []).some(b => b.title === newB.title && b.time === newB.time)
            )
          ],
          key_tasks: [
            ...(dayPlan.plan_json?.key_tasks || []),
            ...(data.key_tasks || []).filter(newT =>
              !(dayPlan.plan_json?.key_tasks || []).some(t => t.title === newT.title)
            )
          ]
        };
        const newInput = (dayPlan.original_input || '') + '\n' + appendInput;
        await base44.entities.DailyPlan.update(dayPlan.id, {
          original_input: newInput,
          theme: merged.theme,
          summary: merged.summary,
          plan_json: merged
        });
        queryClient.invalidateQueries({ queryKey: ['dailyPlan', dayStr] });
        setAppendInput('');
        setShowAppendInput(false);
        toast.success('已将新内容智能融入当日规划');
      }
    } catch (e) {
      toast.error('更新失败，请重试');
    } finally {
      setIsAppending(false);
    }
  };

  // Delete plan
  const handleDelete = async () => {
    if (!dayPlan) return;
    if (!confirm('确定要删除当前规划吗？')) return;
    await base44.entities.DailyPlan.delete(dayPlan.id);
    queryClient.invalidateQueries({ queryKey: ['dailyPlan', dayStr] });
    setStage('input');
    setUserInput('');
    toast.success('规划已删除');
  };

  // Timeline helpers
  const getItemsForHour = (hour) => {
    return tasks.filter(task => {
      if (!task.reminder_time || task.parent_task_id) return false;
      return shouldTaskAppearAtDateTime(task, currentDate, hour);
    });
  };
  const isTaskFirstHour = (task, hour) => {
    if (!task.reminder_time) return false;
    return new Date(task.reminder_time).getHours() === hour;
  };
  const getSubtasks = (parentId) => tasks.filter(task => task.parent_task_id === parentId);
  const toggleTaskExpand = (taskId) => {
    setExpandedTasks(prev => {
      const s = new Set(prev);
      s.has(taskId) ? s.delete(taskId) : s.add(taskId);
      return s;
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

  const dayNotes = notes.filter(note => isSameDay(new Date(note.created_date), currentDate));
  const isCurrentDay = isToday(currentDate);
  const planJson = dayPlan?.plan_json || {};

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-200px)] bg-slate-50/60 rounded-[28px] border border-slate-100 shadow-sm overflow-visible">
      {/* Sidebar */}
      <div className="w-full lg:w-80 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/30">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-4xl font-bold text-slate-900 tracking-tight">{format(currentDate, "d")}</h2>
            <span className="text-lg font-medium text-slate-500">{format(currentDate, "EEEE", { locale: zhCN })}</span>
            {isCurrentDay && <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm shadow-blue-200">Today</span>}
          </div>
          <p className="text-sm text-slate-400 font-medium">{format(currentDate, "yyyy年M月", { locale: zhCN })}</p>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-5 space-y-6">
            {weeklyContext ? (
              <div className="bg-[#384877] rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-[#384877]/20">
                <div className="absolute top-0 right-0 p-3 opacity-10"><Target className="w-20 h-20" /></div>
                <div className="relative z-10">
                  <div className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><Zap className="w-3 h-3" /> 周主题</div>
                  <h3 className="text-lg font-bold leading-tight mb-3">{weeklyContext.theme}</h3>
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
              </div>
            )}
            {dayNotes.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <StickyNote className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-700">今日心签</h3>
                  <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-md ml-auto">{dayNotes.length}</span>
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
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white relative overflow-auto">
        <div className="p-4 md:p-6 border-b border-slate-100/70 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-4xl mx-auto space-y-6">
            <AnimatePresence mode="wait">
              {/* Input Stage: no plan yet */}
              {stage === 'input' && !loadingDayPlan && (
                <DayPlanInput
                  currentDate={currentDate}
                  userInput={userInput}
                  onInputChange={setUserInput}
                  onSubmit={handleProcess}
                  isProcessing={isProcessing}
                />
              )}

              {/* Processing Stage */}
              {stage === 'processing' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center py-16"
                >
                  <div className="w-full max-w-xl bg-white rounded-3xl p-8 border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-3 mb-8 text-[#384877]">
                      <Sparkles className="w-5 h-5 animate-pulse" />
                      <span className="font-medium text-lg">正在生成当日规划...</span>
                    </div>
                    <div className="space-y-6 pl-2">
                      {PROCESSING_STEPS.map((step, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{
                            opacity: idx <= processingStepIndex ? 1 : 0.4,
                            x: idx <= processingStepIndex ? 0 : -10,
                            scale: idx === processingStepIndex ? 1.02 : 1
                          }}
                          className="flex items-center gap-4"
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-sm border transition-colors duration-500",
                            idx < processingStepIndex ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                            idx === processingStepIndex ? "bg-[#384877]/10 border-[#384877]/30 text-[#384877]" :
                            "bg-slate-50 border-slate-100 text-slate-300"
                          )}>
                            {idx < processingStepIndex ? <CheckCircle2 className="w-4 h-4" /> :
                             idx === processingStepIndex ? <div className="w-2 h-2 bg-[#384877] rounded-full animate-ping" /> :
                             <div className="w-2 h-2 bg-slate-200 rounded-full" />}
                          </div>
                          <span className={cn(
                            "text-sm font-medium transition-colors duration-300",
                            idx <= processingStepIndex ? "text-slate-800" : "text-slate-400"
                          )}>{step.text}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results Stage */}
            {stage === 'results' && dayPlan && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <DayPlanHeader
                  dayPlan={dayPlan}
                  currentDate={currentDate}
                  userInput={userInput}
                  onShowAppend={() => setShowAppendInput(v => !v)}
                  onDelete={handleDelete}
                  onReplan={() => { setStage('input'); setUserInput(''); }}
                />

                {/* Append Input */}
                <AnimatePresence>
                  {showAppendInput && (
                    <DayPlanAppendInput
                      value={appendInput}
                      onChange={setAppendInput}
                      onSubmit={handleAppend}
                      onCancel={() => setShowAppendInput(false)}
                      isAppending={isAppending}
                    />
                  )}
                </AnimatePresence>

                {/* Focus Blocks Timeline */}
                {planJson.focus_blocks?.length > 0 && (
                  <ContextTimeline blocks={planJson.focus_blocks} />
                )}

                {/* Key Tasks */}
                {planJson.key_tasks?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900">关键任务</h3>
                    <div className="grid md:grid-cols-2 gap-3">
                      {planJson.key_tasks.map((task, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full mt-2 shrink-0",
                              task.priority === 'high' ? "bg-red-500" : task.priority === 'medium' ? "bg-amber-500" : "bg-emerald-500"
                            )} />
                            <div className="flex-1">
                              <h4 className="font-bold text-slate-900 text-sm">{task.title}</h4>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-slate-400">
                                  {{morning: '上午', afternoon: '下午', evening: '晚间'}[task.time_slot] || task.time_slot}
                                </span>
                                {task.estimated_minutes && (
                                  <span className="text-xs text-slate-400">≈{task.estimated_minutes}分钟</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evening Review */}
                {planJson.evening_review && (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <h4 className="text-sm font-bold text-slate-700 mb-2">🌙 晚间复盘建议</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{planJson.evening_review}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Loading */}
            {loadingDayPlan && (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-3 text-[#384877]">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  <span className="font-medium">加载中...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hourly Timeline */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-auto">
            <div className="p-4 pb-20 max-w-4xl mx-auto">
              {HOURS.map((hour) => {
                const hourTasks = getItemsForHour(hour);
                const dropId = `hour_${hour}`;
                const isPastHour = isToday(currentDate) && hour < new Date().getHours();
                const isCurrentHour = isToday(currentDate) && hour === new Date().getHours();

                return (
                  <div key={hour} className="flex gap-4 group mb-2">
                    <div className="w-16 flex-shrink-0 text-right pt-2 relative">
                      <span className={cn(
                        "text-xs font-semibold font-mono",
                        isCurrentHour ? "text-blue-600 scale-110 origin-right inline-block" : "text-slate-400",
                        isPastHour && "opacity-50"
                      )}>{hour.toString().padStart(2, '0')}:00</span>
                      {isCurrentHour && <div className="absolute right-[-21px] top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white z-20 shadow-sm" />}
                    </div>
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
                            "flex-1 min-h-[88px] rounded-2xl border transition-all duration-200 relative",
                            snapshot.isDraggingOver ? "bg-blue-50 border-blue-300 border-dashed" : "border-slate-100 hover:border-slate-200 hover:shadow-sm",
                            isCurrentHour ? "bg-blue-50/10 border-blue-100" : "bg-white",
                            "before:absolute before:left-0 before:right-0 before:top-4 before:h-px before:bg-slate-50 before:-z-10"
                          )}
                        >
                          {isCurrentHour && <div className="absolute top-4 left-0 right-0 h-px bg-blue-200 z-0 pointer-events-none" />}
                          <div className="p-2 space-y-2 relative z-10">
                            {hourTasks.map((task, index) => {
                              const subtasks = getSubtasks(task.id);
                              const isExpanded = expandedTasks.has(task.id);
                              const isFirstHour = isTaskFirstHour(task, hour);
                              if (!isFirstHour) return null;
                              return (
                                <Draggable key={task.id} draggableId={task.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                                      className={cn(
                                        "group/card relative rounded-2xl border shadow-sm transition-all overflow-hidden",
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
                                              <h4 className={cn("font-semibold text-sm truncate", task.status === 'completed' && "line-through text-slate-500")}>{task.title}</h4>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs opacity-80 font-medium">
                                              <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>{format(new Date(task.reminder_time), "HH:mm")}{task.end_time && ` - ${format(new Date(task.end_time), "HH:mm")}`}</span>
                                              </div>
                                              {subtasks.length > 0 && (
                                                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white/50 rounded-md">
                                                  <span className="text-[10px]">{subtasks.filter(t => t.status === 'completed').length}/{subtasks.length}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          {subtasks.length > 0 && (
                                            <button onClick={(e) => { e.stopPropagation(); toggleTaskExpand(task.id); }} className="p-1 hover:bg-black/5 rounded-md transition-colors">
                                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </button>
                                          )}
                                        </div>
                                        <AnimatePresence>
                                          {isExpanded && subtasks.length > 0 && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 pt-3 border-t border-black/5 space-y-1.5">
                                              {subtasks.map(sub => (
                                                <div key={sub.id} className="flex items-center gap-2 text-xs opacity-90">
                                                  <div className={cn("w-1.5 h-1.5 rounded-full", sub.status === 'completed' ? "bg-emerald-500" : "bg-current opacity-40")} />
                                                  <span className={cn(sub.status === 'completed' && "line-through opacity-60")}>{sub.title}</span>
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
                            {hourTasks.length === 0 && (
                              <div className={cn(
                                "h-full min-h-[60px] flex items-center justify-center text-xs text-slate-300 font-medium transition-opacity",
                                snapshot.isDraggingOver ? "opacity-0" : "opacity-0 hover:opacity-100"
                              )}>
                                <Plus className="w-4 h-4 mr-1" />添加安排
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
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}