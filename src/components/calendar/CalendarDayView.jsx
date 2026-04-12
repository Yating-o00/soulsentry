import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, startOfWeek, addDays, parseISO, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, Plus, ChevronDown, ChevronRight, Target, Calendar as CalendarIcon, Zap, CheckCircle2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// // // import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { shouldTaskAppearAtDateTime } from "@/components/utils/recurrenceHelper";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ContextTimeline from "../dashboard/planner/ContextTimeline";
import AutoExecCards from "../dashboard/planner/AutoExecCards";
import AnalysisSteps from "../dashboard/planner/AnalysisSteps";
import DeviceStrategyMap from "../dashboard/planner/DeviceStrategyMap";
import { Textarea } from "@/components/ui/textarea";
import DayPlanSummary from "./DayPlanSummary";

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
  onCreateSubtask,
  onNavigateToDate
}) {
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  
  // Fetch Weekly Plan Context
  // Ensure currentDate is always a Date object (may receive a string from navigation)
  const safeCurrentDate = currentDate instanceof Date ? currentDate : new Date(currentDate);
  const weekStart = startOfWeek(safeCurrentDate, { locale: zhCN, weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  
  const { data: weeklyPlans } = useQuery({
    queryKey: ['weeklyPlan', weekStartStr],
    queryFn: () => base44.entities.WeeklyPlan.filter({ week_start_date: weekStartStr }),
    staleTime: 5 * 60 * 1000
  });

  // Daily plan for current date
  const dayStr = format(safeCurrentDate, 'yyyy-MM-dd');
  const { data: dayPlans, isLoading: loadingDayPlan } = useQuery({
    queryKey: ['dailyPlan', dayStr],
    queryFn: () => base44.entities.DailyPlan.filter({ plan_date: dayStr }),
    staleTime: 5 * 60 * 1000
  });
  const dayPlan = useMemo(() => (dayPlans && dayPlans.length > 0 ? dayPlans[0] : null), [dayPlans]);

  const queryClient = useQueryClient();
  const saveAttemptedRef = useRef(null);

  // AI intent analysis state
  const [aiInput, setAiInput] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resolvedDateHint, setResolvedDateHint] = useState(null);

  const DEFAULT_STEPS = [
    { key: 'time_extraction', text: '提取时间实体…' },
    { key: 'intent', text: '识别意图与优先级…' },
    { key: 'spatial', text: '空间/路径计算…' },
    { key: 'device', text: '设备协同分发策略…' },
    { key: 'automation', text: '生成自动化任务…' },
  ];

  const handleAnalyze = async () => {
  if (!aiInput.trim() || isAnalyzing) return;
  setIsAnalyzing(true);
  try {
    // Build existing plan context: prefer current analysis state, fallback to saved dayPlan
    let existingPlan = null;
    if (analysis) {
      existingPlan = {
        timeline: analysis.timeline || [],
        devices: analysis.devices || [],
        automations: analysis.automations || [],
      };
    } else if (dayPlan?.plan_json) {
      // First AI input of the session — use saved daily plan as context
      const dp = dayPlan.plan_json;
      existingPlan = {
        timeline: (dp.focus_blocks || []).map(b => ({ time: b.time, title: b.title, description: b.description, type: b.type || 'focus', date: dayStr })),
        devices: [],
        automations: (dp.key_tasks || []).map(t => ({ title: t.title, desc: t.description || '', status: t.status === 'completed' ? 'active' : 'ready' })),
      };
    }
    const { data } = await base44.functions.invoke('analyzeIntent', { input: aiInput, date: dayStr, existingPlan });
    
    // Determine the target date for this plan
    const targetDate = data.resolved_date || dayStr;
    
    if (targetDate === dayStr) {
      // Input belongs to the current viewing date — show results inline and persist
      setAnalysis(data);
      setResolvedDateHint(null);
      
      // Auto-save / update DailyPlan for the current date
      const planRecord = {
        plan_date: dayStr,
        original_input: aiInput,
        theme: data.parsed?.intents?.[0] || '',
        summary: '',
        plan_json: {
          key_tasks: (data.automations || []).map(a => ({ title: a.title, description: a.desc || '', status: a.status === 'active' ? 'pending' : 'pending', priority: 'medium', category: 'other' })),
          focus_blocks: (data.timeline || []).filter(t => !t.date || t.date === dayStr).map(t => ({ time: t.time, title: t.title, description: t.description || '', type: t.type || 'focus' })),
        },
        is_active: true,
      };
      if (dayPlan) {
        // Merge: keep existing key_tasks + focus_blocks, append new ones
        const existingTasks = dayPlan.plan_json?.key_tasks || [];
        const existingBlocks = dayPlan.plan_json?.focus_blocks || [];
        planRecord.plan_json.key_tasks = [...existingTasks, ...planRecord.plan_json.key_tasks];
        planRecord.plan_json.focus_blocks = [...existingBlocks, ...planRecord.plan_json.focus_blocks];
        planRecord.original_input = [dayPlan.original_input, aiInput].filter(Boolean).join('\n');
        await base44.entities.DailyPlan.update(dayPlan.id, planRecord);
      } else {
        await base44.entities.DailyPlan.create(planRecord);
      }
      queryClient.invalidateQueries({ queryKey: ['dailyPlan', dayStr] });
    } else {
      // Input belongs to a different date — don't show analysis inline, only show navigation hint
      setAnalysis(null);
      setResolvedDateHint(targetDate);
      
      // Persist to the target date's DailyPlan
      const targetPlanRecord = {
        plan_date: targetDate,
        original_input: aiInput,
        theme: data.parsed?.intents?.[0] || '',
        summary: '',
        plan_json: {
          key_tasks: (data.automations || []).map(a => ({ title: a.title, description: a.desc || '', status: 'pending', priority: 'medium', category: 'other' })),
          focus_blocks: (data.timeline || []).filter(t => !t.date || t.date === targetDate).map(t => ({ time: t.time, title: t.title, description: t.description || '', type: t.type || 'focus' })),
        },
        is_active: true,
      };
      // Check if target date already has a plan
      const targetPlans = await base44.entities.DailyPlan.filter({ plan_date: targetDate });
      if (targetPlans && targetPlans.length > 0) {
        const tp = targetPlans[0];
        const existingTasks = tp.plan_json?.key_tasks || [];
        const existingBlocks = tp.plan_json?.focus_blocks || [];
        targetPlanRecord.plan_json.key_tasks = [...existingTasks, ...targetPlanRecord.plan_json.key_tasks];
        targetPlanRecord.plan_json.focus_blocks = [...existingBlocks, ...targetPlanRecord.plan_json.focus_blocks];
        targetPlanRecord.original_input = [tp.original_input, aiInput].filter(Boolean).join('\n');
        await base44.entities.DailyPlan.update(tp.id, targetPlanRecord);
      } else {
        await base44.entities.DailyPlan.create(targetPlanRecord);
      }
      queryClient.invalidateQueries({ queryKey: ['dailyPlan', targetDate] });
    }
    setAiInput("");
  } finally {
    setIsAnalyzing(false);
  }
  };

  const quickFill = (text) => setAiInput(text);

  const resultsRef = useRef(null);
  useEffect(() => {
    if (analysis && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [analysis]);

  // 未输入新内容前：自动保存当日任务计划（仅在无当日计划时触发一次）
  useEffect(() => {
    if (loadingDayPlan) return;
    if (isAnalyzing) return;
    if (aiInput && aiInput.trim().length > 0) return; // 用户已有新输入，不做自动保存
    if (dayPlan) return; // 已存在当日AI规划
    if (!tasks || tasks.length === 0) return;

    const todaysTasks = tasks.filter(t => t.reminder_time && isSameDay(new Date(t.reminder_time), safeCurrentDate) && !t.parent_task_id);
    if (todaysTasks.length === 0) return;

    if (saveAttemptedRef.current === dayStr) return; // 避免重复保存
    saveAttemptedRef.current = dayStr;

    const plan_json = {
      key_tasks: todaysTasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        reminder_time: t.reminder_time,
        end_time: t.end_time || null,
        priority: t.priority || 'medium',
        category: t.category || 'other',
        status: t.status || 'pending'
      })),
      focus_blocks: []
    };

    base44.entities.DailyPlan.create({
      plan_date: dayStr,
      original_input: '',
      theme: '',
      summary: '',
      plan_json
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlan', dayStr] });
    }).catch((e) => {
      console.error('Auto-save daily plan failed', e);
    });
  }, [aiInput, isAnalyzing, dayPlan, tasks, safeCurrentDate, dayStr, loadingDayPlan]);

  const weeklyContext = useMemo(() => {
    if (!weeklyPlans || weeklyPlans.length === 0) return null;
    const plan = weeklyPlans[0];
    
    // Find today's specific plan from events
    const currentDayStr = format(safeCurrentDate, 'yyyy-MM-dd');
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
  }, [weeklyPlans, safeCurrentDate, weekStart]);

  const getItemsForHour = (hour) => {
    return tasks.filter(task => {
      if (!task.reminder_time || task.parent_task_id) return false;
      return shouldTaskAppearAtDateTime(task, safeCurrentDate, hour);
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
        const destinationDate = new Date(safeCurrentDate);
        destinationDate.setHours(hour, 0, 0, 0);
        onTaskDrop(taskId, destinationDate);
    }
  };

  const dayNotes = notes.filter(note => 
    isSameDay(new Date(note.created_date), safeCurrentDate)
  );
  
  const isCurrentDay = isToday(safeCurrentDate);

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-200px)] bg-slate-50/60 rounded-[28px] border border-slate-100 shadow-sm overflow-visible">
      {/* Main Timeline */}
      <div className="flex-1 flex flex-col bg-white relative overflow-auto">
        <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-white to-transparent z-10" />
        <div className="p-4 md:p-6 border-b border-slate-100/70 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* AI 输入区 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <Textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder={`当前查看：${format(safeCurrentDate, "M月d日 EEEE", { locale: zhCN })}｜输入安排，AI 会自动识别日期…`}
                className="min-h-[84px]"
                onKeyDown={(e) => {
                  const composing = e.nativeEvent && e.nativeEvent.isComposing;
                  if (!composing && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); }
                }}
              />
              <div className="flex justify-between items-center mt-2 flex-wrap gap-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => quickFill('今晚8点给妈妈打电话，聊聊最近身体情况')} className="px-3 py-1.5 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100">📞 给妈妈打电话</button>
                  <button type="button" onClick={() => quickFill('下周二前完成Q4报告，每天下午提醒我进度')} className="px-3 py-1.5 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100">📊 季度报告DDL</button>
                  <button type="button" onClick={() => quickFill('明天早上7点飞深圳，提前一晚提醒收拾行李')} className="px-3 py-1.5 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100">✈️ 明早航班</button>
                </div>
                <Button onClick={handleAnalyze} disabled={isAnalyzing || !aiInput.trim()} className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-9 px-4 text-sm">{isAnalyzing ? '分析中…' : '发送'}</Button>
              </div>
            </div>

            {/* 日期跳转提示：当AI识别出的日期与当前视图不同 */}
            {resolvedDateHint && resolvedDateHint !== dayStr && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800"
              >
                <CalendarIcon className="w-4 h-4 shrink-0" />
                <span className="text-sm flex-1">
                  AI 识别到该安排属于 <strong>{resolvedDateHint}</strong>，与当前查看日期（{dayStr}）不同
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-100 rounded-xl h-8 text-xs gap-1.5 shrink-0"
                  onClick={() => {
                    if (onNavigateToDate) onNavigateToDate(resolvedDateHint);
                    setResolvedDateHint(null);
                  }}
                >
                  跳转查看 <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </motion.div>
            )}

            {/* 解析步骤：仅分析中展示，完成后自动折叠隐藏 */}
            {isAnalyzing && (
              <AnalysisSteps steps={DEFAULT_STEPS} running={true} />
            )}

            {analysis && <div ref={resultsRef} />}

            {/* 设备策略一对一映射 */}
            {analysis?.devices?.length > 0 && (
              <DeviceStrategyMap devices={analysis.devices} />
            )}

            {/* 情境时间线：仅展示属于当前日期的条目 */}
            {analysis?.timeline?.length > 0 && (() => {
              const dayBlocks = analysis.timeline.filter(t => !t.date || t.date === dayStr);
              return dayBlocks.length > 0 ? (
                <ContextTimeline blocks={dayBlocks.map(t => ({ time: t.time, title: t.title, description: t.description, type: t.type || 'focus' }))} />
              ) : null;
            })()}

            {/* 自动化清单（根据用户输入可生成占位操作；若无则不显示）*/}
            <AutoExecCards
              tasks={(analysis?.automations || []).map(a => ({ title: a.title, desc: a.desc, status: a.status }))}
              userText={aiInput}
            />

            {/* 若暂无分析结果，显示当日规划摘要 */}
            {!analysis && (
              <DayPlanSummary dayPlan={dayPlan} isLoading={loadingDayPlan} />
            )}
          </div>
        </div>
        
        <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex-1 overflow-auto">
                <div className="p-4 pb-20 max-w-4xl mx-auto">
                    {HOURS.map((hour) => {
                        const hourTasks = getItemsForHour(hour);
                        const dropId = `hour_${hour}`;
                        const isPastHour = isToday(safeCurrentDate) && hour < new Date().getHours();
                        const isCurrentHour = isToday(safeCurrentDate) && hour === new Date().getHours();

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
                                                const clickDate = new Date(safeCurrentDate);
                                                clickDate.setHours(hour, 0, 0, 0);
                                                onDateClick(clickDate);
                                            }}
                                            className={cn(
                                                "flex-1 min-h-[88px] rounded-2xl border transition-all duration-200 relative",
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
            </div>
        </DragDropContext>


      </div>

      {/* Right Sidebar: Context & Notes */}
      <div className="w-full lg:w-72 bg-white border-l border-slate-100 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/30">
            <div className="flex items-baseline gap-3 mb-1">
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                    {format(safeCurrentDate, "d")}
                </h2>
                <span className="text-base font-medium text-slate-500">
                    {format(safeCurrentDate, "EEEE", { locale: zhCN })}
                </span>
                {isCurrentDay && (
                    <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm shadow-blue-200">
                        Today
                    </span>
                )}
            </div>
            <p className="text-xs text-slate-400 font-medium">
                {format(safeCurrentDate, "yyyy年M月", { locale: zhCN })}
            </p>
        </div>

        <div className="flex-1 overflow-auto">
            <div className="p-4 space-y-5">
                {/* Weekly Context Card */}
                {weeklyContext ? (
                    <div className="bg-[#384877] rounded-2xl p-4 text-white relative overflow-hidden shadow-md shadow-[#384877]/15">
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                            <Target className="w-14 h-14" />
                        </div>
                        <div className="relative z-10">
                            <div className="text-blue-200 text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <Zap className="w-3 h-3" /> 周主题
                            </div>
                            <h3 className="text-sm font-bold leading-tight mb-2">
                                {weeklyContext.theme}
                            </h3>
                            
                            {weeklyContext.dayEvents.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                                    <div className="text-blue-200 text-[10px] font-medium">今日 AI 规划:</div>
                                    {weeklyContext.dayEvents.slice(0, 3).map((e, idx) => (
                                        <div key={idx} className="flex items-start gap-1.5 text-xs text-white/90">
                                            <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                                            <span className="leading-relaxed line-clamp-2">{e.title}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center">
                        <p className="text-slate-400 text-xs">本周暂无 AI 规划</p>
                        <Button variant="link" className="text-[#384877] text-xs h-auto p-0 mt-1">
                            去生成规划 &rarr;
                        </Button>
                    </div>
                )}

                {/* Day Notes */}
                <div>
                    <div className="flex items-center gap-2 mb-2.5 px-0.5">
                        <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                        <h3 className="text-xs font-bold text-slate-600">今日心签</h3>
                        <span className="bg-amber-50 text-amber-600 text-[10px] px-1.5 py-0.5 rounded-md ml-auto font-medium">
                            {dayNotes.length}
                        </span>
                    </div>
                    {dayNotes.length > 0 ? (
                        <div className="space-y-2">
                            {dayNotes.slice(0, 4).map(note => (
                                <div key={note.id} className="p-2.5 rounded-xl bg-amber-50/40 border border-amber-100/80 text-amber-900/70 text-xs leading-relaxed line-clamp-3 hover:bg-amber-50/70 transition-colors cursor-pointer">
                                    <div dangerouslySetInnerHTML={{ __html: note.content }} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 text-center">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-2">
                                <StickyNote className="w-4.5 h-4.5 text-amber-300" />
                            </div>
                            <p className="text-xs text-slate-400">今日暂无心签</p>
                            <p className="text-[10px] text-slate-300 mt-0.5">在心签页随时记录灵感</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}