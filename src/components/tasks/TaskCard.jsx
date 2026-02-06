import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Clock,
  AlertCircle,
  Repeat,
  Trash2,
  Edit,
  Sparkles,
  ShieldAlert,
  CalendarClock,
  Briefcase,
  User,
  Heart,
  GraduationCap,
  Users,
  ShoppingCart,
  Wallet,
  MoreHorizontal,
  Bell,
  Volume2,
  TimerReset,
  FileText as FileIcon,
  StickyNote,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CheckCircle2,
  Share2,
  RotateCcw,
  Link as LinkIcon,
  Ban,
  MoreHorizontal as MoreIcon,
  Languages,
  Loader2
  } from "lucide-react";
  import { motion, AnimatePresence } from "framer-motion";
  import AITranslatedText from "@/components/AITranslatedText";
  import { useTaskTranslation } from "@/components/hooks/useTaskTranslation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
  } from "@/components/ui/dropdown-menu";
  import TaskShareCard from "./TaskShareCard"; // Added import for TaskShareCard

const CATEGORY_ICONS = {
  work: Briefcase,
  personal: User,
  health: Heart,
  study: GraduationCap,
  family: Users,
  shopping: ShoppingCart,
  finance: Wallet,
  other: MoreHorizontal,
};

const CATEGORY_COLORS = {
  work: "bg-[#f9fafb] text-[#384877] border-[#dce4ed]",
  personal: "bg-[#f4f6f8] text-[#384877] border-[#dce4ed]",
  health: "bg-[#ecfdf5] text-[#10b981] border-[#86efac]",
  study: "bg-[#fef3c7] text-[#f59e0b] border-[#fcd34d]",
  family: "bg-[#fce7f3] text-[#ec4899] border-[#f9a8d4]",
  shopping: "bg-[#fff7ed] text-[#f97316] border-[#fdba74]",
  finance: "bg-[#fff1f2] text-[#d5495f] border-[#e0919e]",
  other: "bg-[#f4f6f8] text-[#52525b] border-[#e4e4e7]",
};

const PRIORITY_COLORS = {
  low: "text-[#a1a1aa]",
  medium: "text-[#384877]",
  high: "text-[#de6d7e]",
  urgent: "text-[#d5495f]",
};

const PRIORITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

const CATEGORY_LABELS = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他",
};

// Add haptic feedback for mobile
const triggerHaptic = () => {
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
};

export default function TaskCard({ task, onComplete, onDelete, onEdit, onUpdate, onClick, onSubtaskToggle, isTrash, onRestore, onDeleteForever, subtasks: propSubtasks, hideSubtaskList = false, onToggleSubtasks, isExpanded = false, selectable = false, selected = false, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const { translateTask, isTranslating } = useTaskTranslation();
  
  // Fetch latest completion history (only for recurring tasks to avoid excessive API calls)
  const { data: latestCompletion } = useQuery({
     queryKey: ['task-completion-latest', task.id],
     queryFn: async () => {
         const res = await base44.entities.TaskCompletion.filter({ task_id: task.id }, "-completed_at", 1);
         return res[0] || null;
     },
     enabled: !!task.id && !isTrash && !!task.repeat_rule && task.repeat_rule !== 'none',
     staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // 查询子约定 (如果外部未传入)
  const { data: fetchedSubtasks = [] } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task?.id && !propSubtasks,
    initialData: [],
  });

  const subtasks = propSubtasks || fetchedSubtasks;

  const CategoryIcon = CATEGORY_ICONS[task.category] || MoreHorizontal;
  const isCompleted = task.status === "completed";
  const isSnoozed = task.status === "snoozed";
  const isBlocked = task.status === "blocked";
  
  // Update isPast to consider end_time if available
  const checkDate = task.end_time ? new Date(task.end_time) : new Date(task.reminder_time);
  const isPast = checkDate < new Date() && !isCompleted && !isSnoozed && !isBlocked;
  
  const hasSubtasks = subtasks.length > 0;

  // Fetch dependencies info if blocked or has dependencies
  const { data: dependencies = [] } = useQuery({
      queryKey: ['task-dependencies', task.id],
      queryFn: async () => {
          if (!task.dependencies || task.dependencies.length === 0) return [];
          // This might be inefficient for list view, but it's a trade-off for MVP. 
          // Better would be to fetch all tasks once in parent.
          // Assuming base44.entities.Task.list supports ids filter if implemented, but here we filter manually or use separate calls
          // Optimization: In a real app, we'd pass allTasks map.
          // For now, we only show dependency count or simple status.
          return []; 
      },
      enabled: false // Disable auto fetch for list view performance, just use counts or passed data if available
  });

  // 计算子约定完成进度
  const completedSubtasks = subtasks.filter(s => s.status === "completed").length;
  const progress = hasSubtasks ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  const getRecurrenceText = () => {
    if (task.repeat_rule === "custom" && task.custom_recurrence) {
      const rec = task.custom_recurrence;
      if (rec.frequency === "weekly" && rec.days_of_week?.length > 0) {
        return `每周${rec.days_of_week.length > 1 ? `${rec.days_of_week.length}天` : "一次"}`;
      }
      if (rec.frequency === "monthly" && rec.days_of_month?.length > 0) {
        return `每月${rec.days_of_month.length > 1 ? `${rec.days_of_month.length}天` : "一次"}`;
      }
    }
    return {
      none: null,
      daily: "每天",
      weekly: "每周",
      monthly: "每月",
    }[task.repeat_rule];
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -100 }}
        layout
      >
        <Card
          className={`group border border-[#e5e9ef] hover:border-[#c8d1e0] hover:shadow-lg transition-all duration-200 bg-white rounded-[16px] ${
            isCompleted
              ? 'opacity-60'
              : isBlocked
              ? 'border-l-[3px] border-l-[#f43f5e] bg-red-50/30'
              : isSnoozed
              ? 'border-l-[3px] border-l-[#fbbf24]'
              : isPast
              ? 'border-l-[3px] border-l-[#d5495f]'
              : 'border-l-[3px] border-l-[#384877] hover:translate-y-[-1px]'
            }`}
            >
          {/* 主约定 */}
          <div className="p-4 md:p-5">
            <div className="flex items-start gap-3 md:gap-4">
              {!isTrash && (
                <motion.div
                  whileTap={{ scale: 0.85 }}
                  transition={{ duration: 0.1 }}
                  className="touch-manipulation"
                  onClick={(e) => e.stopPropagation()}
                >
                  {selectable ? (
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => {
                        onSelect?.(task);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-6 w-6 md:h-5 md:w-5 rounded-[6px] data-[state=checked]:bg-[#384877] border-[#dce4ed] transition-all duration-150"
                    />
                  ) : (
                    <Checkbox
                      checked={isCompleted}
                      onCheckedChange={(checked) => {
                        onComplete?.();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-6 w-6 md:h-5 md:w-5 rounded-[6px] data-[state=checked]:bg-[#10b981] border-[#dce4ed] transition-all duration-150"
                    />
                  )}
                </motion.div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                  <div className="flex items-center gap-1.5 md:gap-2 flex-1 cursor-pointer touch-manipulation" onClick={(e) => {
                    e.stopPropagation();
                    onClick && onClick(e);
                  }}>
                  {hasSubtasks && !hideSubtaskList && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(!expanded);
                      }}
                      className="hover:bg-[#e5e9ef] rounded-lg p-1.5 md:p-1 transition-colors touch-manipulation min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                    >
                      {expanded ? (
                        <ChevronDown className="w-5 h-5 md:w-4 md:h-4 text-[#384877]" />
                      ) : (
                        <ChevronRight className="w-5 h-5 md:w-4 md:h-4 text-[#384877]" />
                      )}
                    </button>
                  )}
                  <h3 className={`text-base md:text-[17px] font-semibold tracking-tight leading-relaxed ${
                      isCompleted ? 'line-through text-[#a1a1aa]' : 'text-[#222222]'
                    }`}>
                      <AITranslatedText text={task.title} />
                    </h3>
                  </div>
                  <div className="flex gap-1.5 md:gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                    {isTrash ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestore();
                          }}
                          className="h-8 px-2 hover:bg-[#f0fdf4] hover:text-[#16a34a] rounded-lg text-xs font-medium"
                          title="恢复约定"
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          恢复
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteForever();
                          }}
                          className="h-8 px-2 hover:bg-[#fee2e2] hover:text-[#dc2626] rounded-lg text-xs font-medium"
                          title="永久删除"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          彻底删除
                        </Button>
                      </>
                    ) : (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 w-8 hover:bg-[#e5e9ef] hover:text-[#384877] rounded-lg"
                            >
                              <MoreIcon className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>快速操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                onComplete();
                            }}>
                                {isCompleted ? <Circle className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                {isCompleted ? "标记未完成" : "标记完成"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}>
                                <Edit className="mr-2 h-4 w-4" />
                                编辑约定
                            </DropdownMenuItem>

                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <AlertCircle className="mr-2 h-4 w-4" />
                                优先级
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate({ priority: 'low' }); }}>
                                  低优先级
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate({ priority: 'medium' }); }}>
                                  中优先级
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate({ priority: 'high' }); }}>
                                  高优先级
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate({ priority: 'urgent' }); }}>
                                  紧急
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                setShowShareCard(true);
                            }}>
                                <Share2 className="mr-2 h-4 w-4" />
                                分享约定
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem 
                                className="text-red-600 focus:text-red-600"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                移至回收站
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </div>

                {task.description && (
                  <p className="text-sm md:text-[15px] text-[#52525b] mb-3 line-clamp-2 cursor-pointer leading-relaxed touch-manipulation" onClick={onClick}>
                    <AITranslatedText text={task.description} />
                  </p>
                )}

                {hasSubtasks && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] text-[#a1a1aa]">子约定进度</span>
                      <span className="text-[13px] font-semibold text-[#384877]">
                        {completedSubtasks}/{subtasks.length} 已完成 ({progress}%)
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                  {isBlocked && (
                      <Badge className="bg-[#f43f5e] text-white rounded-[8px] text-[13px] border-[#f43f5e] flex items-center gap-1 animate-pulse">
                          <Ban className="w-3 h-3" />
                          阻塞中
                      </Badge>
                  )}

                  {task.dependencies && task.dependencies.length > 0 && (
                       <Badge variant="outline" className="text-slate-500 border-slate-200 rounded-[8px] text-[13px] flex items-center gap-1">
                          <LinkIcon className="w-3 h-3" />
                          依赖 {task.dependencies.length} 项
                      </Badge>
                  )}

                  <Badge
                    variant="outline"
                    className={`${CATEGORY_COLORS[task.category]} border rounded-[8px] text-[13px] font-medium`}
                  >
                    <CategoryIcon className="w-3 h-3 mr-1" />
                    {CATEGORY_LABELS[task.category] || task.category}
                  </Badge>

                  <Badge
                    variant="outline"
                    className="rounded-[8px] text-[13px] border-[#dce4ed]"
                  >
                    <Clock className={`w-3 h-3 mr-1 ${PRIORITY_COLORS[task.priority] || ''}`} />
                    {isSnoozed 
                      ? format(new Date(task.snooze_until), "M月d日 HH:mm", { locale: zhCN })
                      : task.end_time
                        ? (() => {
                            const start = new Date(task.reminder_time);
                            const end = new Date(task.end_time);
                            const isSameDay = start.toDateString() === end.toDateString();
                            return isSameDay 
                              ? `${format(start, "M月d日 HH:mm", { locale: zhCN })} - ${format(end, "HH:mm", { locale: zhCN })}`
                              : `${format(start, "M月d日 HH:mm", { locale: zhCN })} - ${format(end, "M月d日 HH:mm", { locale: zhCN })}`
                          })()
                        : format(new Date(task.reminder_time), "M月d日 HH:mm", { locale: zhCN })
                    }
                  </Badge>

                  {getRecurrenceText() && (
                    <Badge variant="outline" className="rounded-[8px] text-[13px] border-[#dce4ed]">
                      <Repeat className="w-3 h-3 mr-1 text-[#384877]" />
                      {getRecurrenceText()}
                    </Badge>
                  )}

                  <Badge
                    variant="outline"
                    className={`${PRIORITY_COLORS[task.priority] || ''} border-current rounded-[8px] text-[13px]`}
                  >
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {PRIORITY_LABELS[task.priority] || task.priority || '中'}
                  </Badge>

                  {task.ai_analysis?.suggested_priority && task.ai_analysis.suggested_priority !== task.priority && (
                    <Badge 
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-0 rounded-[8px] text-[13px] shadow-sm"
                      title={`AI 建议: ${task.ai_analysis.priority_reasoning}`}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      建议: {PRIORITY_LABELS[task.ai_analysis.suggested_priority]}
                    </Badge>
                  )}

                  {task.ai_analysis?.risk_level && ['high', 'critical'].includes(task.ai_analysis.risk_level) && (
                     <Badge 
                      className="bg-red-100 text-red-600 border-red-200 rounded-[8px] text-[13px]"
                      title={`高风险约定: ${task.ai_analysis.risks?.join('; ')}`}
                    >
                      <ShieldAlert className="w-3 h-3 mr-1" />
                      {task.ai_analysis.risk_level === 'critical' ? '极高风险' : '高风险'}
                    </Badge>
                  )}

                  {task.ai_analysis?.recommended_execution_start && (
                     <Badge 
                      variant="outline"
                      className="bg-blue-50 text-blue-600 border-blue-200 rounded-[8px] text-[13px]"
                      title={`AI 建议时间: ${task.ai_analysis.time_reasoning}`}
                    >
                      <CalendarClock className="w-3 h-3 mr-1" />
                      建议: {format(new Date(task.ai_analysis.recommended_execution_start), "MM-dd HH:mm")}
                    </Badge>
                  )}

                  {hasSubtasks && (
                    <Badge 
                      className={`bg-[#384877] text-white rounded-[8px] text-[13px] ${onToggleSubtasks ? 'cursor-pointer hover:bg-[#2c3b63] transition-colors' : ''}`}
                      onClick={(e) => {
                        if (onToggleSubtasks) {
                          e.stopPropagation();
                          onToggleSubtasks();
                        }
                      }}
                    >
                      {subtasks.length} 个子约定
                      {onToggleSubtasks && (
                        isExpanded ? <ChevronUp className="w-3 h-3 ml-1 inline" /> : <ChevronDown className="w-3 h-3 ml-1 inline" />
                      )}
                    </Badge>
                  )}

                  {latestCompletion && task.status !== 'completed' && (
                     <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 rounded-[8px] text-[13px]" title="上次完成时间">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        上次: {format(new Date(latestCompletion.completed_at), "M-d", { locale: zhCN })}
                     </Badge>
                  )}

                  {task.persistent_reminder && (
                    <Badge className="bg-[#06b6d4] text-white rounded-[8px] text-[13px]">
                      <Bell className="w-3 h-3 mr-1" />
                      持续提醒
                    </Badge>
                  )}

                  {task.advance_reminders && task.advance_reminders.length > 0 && (
                    <Badge variant="outline" className="rounded-[8px] text-[13px] text-[#0891b2] border-[#bae6fd] bg-[#f0f9ff]">
                      <Volume2 className="w-3 h-3 mr-1" />
                      提前{task.advance_reminders.length}次
                    </Badge>
                  )}

                  {task.attachments && task.attachments.length > 0 && (
                    <Badge variant="outline" className="rounded-[8px] text-[13px] text-[#10b981] border-[#86efac] bg-[#f0fdf4]">
                      <FileIcon className="w-3 h-3 mr-1" />
                      {task.attachments.length}个附件
                    </Badge>
                  )}

                  {task.notes && task.notes.length > 0 && (
                    <Badge variant="outline" className="rounded-[8px] text-[13px] text-amber-600 border-amber-300 bg-amber-50">
                      <StickyNote className="w-3 h-3 mr-1" />
                      {task.notes.length}条笔记
                    </Badge>
                  )}

                  {isSnoozed && (
                    <Badge className="bg-[#f59e0b] text-white rounded-[8px] text-[13px] shadow-sm">
                      <TimerReset className="w-3 h-3 mr-1" />
                      已推迟 {task.snooze_count}次
                    </Badge>
                  )}

                  {isPast && !isCompleted && !isSnoozed && (
                    <Badge className="bg-[#d5495f] text-white rounded-[8px] text-[13px] shadow-sm">
                      已过期
                    </Badge>
                  )}
                </div>

                {task.ai_analysis?.status_summary && (
                  <div className="mt-3 text-xs text-slate-600 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 p-2.5 rounded-lg border border-indigo-100 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                    <span className="leading-relaxed">{task.ai_analysis.status_summary}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 子约定列表 */}
          <AnimatePresence>
            {expanded && hasSubtasks && !hideSubtaskList && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-[#e5e9ef] bg-[#f9fafb]"
              >
                {subtasks.map((subtask, subIndex) => {
                  const isSubtaskCompleted = subtask.status === "completed";
                  // 尝试从标题中提取序号，如果没有则使用索引
                  const title = subtask.title || '';
                  const titleMatch = (title && typeof title === 'string' && title.includes('.')) ? title.match(/^(\d+)\.\s*/) : null;
                  const orderNumber = (titleMatch && titleMatch[1]) ? titleMatch[1] : (subIndex + 1);
                  const cleanTitle = (titleMatch && title) ? title.replace(/^\d+\.\s*/, '') : title;

                  return (
                    <motion.div
                      key={subtask.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`px-5 py-3 ml-9 border-l-2 transition-all ${
                        isSubtaskCompleted
                          ? 'border-[#86efac] bg-[#ecfdf5]/50'
                          : 'border-[#dce4ed] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* 子约定序号标识 */}
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSubtaskCompleted
                            ? 'bg-[#10b981] text-white'
                            : 'bg-[#384877] text-white'
                        }`}>
                          {isSubtaskCompleted ? '✓' : orderNumber}
                        </div>

                        <motion.div
                          whileTap={{ scale: 0.85 }}
                          transition={{ duration: 0.1 }}
                        >
                          {selectable ? (
                             <div className="w-4 h-4" />
                             ) : (
                              <Checkbox
                                checked={isSubtaskCompleted}
                                onCheckedChange={(e) => {
                                  e?.stopPropagation?.();
                                  onSubtaskToggle?.(subtask);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 rounded data-[state=checked]:bg-[#10b981] mt-0.5 transition-all duration-150"
                              />
                             )}
                        </motion.div>

                        <div className="flex-1">
                          <span className={`block text-[15px] font-medium mb-1 ${
                            isSubtaskCompleted
                              ? 'line-through text-[#a1a1aa]'
                              : 'text-[#222222]'
                          }`}>
                            {cleanTitle}
                          </span>

                          {subtask.description && (
                            <p className="text-xs text-slate-500 mb-2">{subtask.description}</p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            {subtask.reminder_time && (
                              <Badge variant="outline" className="text-xs bg-white text-slate-700 border-slate-300">
                                <Clock className={`w-3 h-3 mr-1 ${PRIORITY_COLORS[subtask.priority] || ''}`} />
                                {format(new Date(subtask.reminder_time), "M月d日 HH:mm", { locale: zhCN })}
                              </Badge>
                            )}
                            <Badge className={`text-[13px] ${
                              isSubtaskCompleted
                                ? 'bg-[#10b981] text-white border-[#10b981]'
                                : 'bg-white text-[#222222] border border-[#dce4ed]'
                            } rounded-[6px]`}>
                              {isSubtaskCompleted ? '✅ 已完成' : '📌 待完成'}
                            </Badge>
                            {isSubtaskCompleted && subtask.completed_at && (
                              <Badge variant="outline" className="text-[13px] text-[#10b981] border-[#86efac] bg-[#f0fdf4] rounded-[6px]">
                                {format(new Date(subtask.completed_at), "M月d日 完成", { locale: zhCN })}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* 分享卡片弹窗 */}
      {showShareCard && (
        <TaskShareCard
          task={task}
          open={showShareCard}
          onClose={() => setShowShareCard(false)}
        />
      )}
    </>
  );
}