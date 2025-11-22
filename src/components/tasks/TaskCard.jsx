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
  FileText,
  StickyNote,
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  Share2 // Added Share2 icon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  work: "bg-[#f9fafb] text-[#5a647d] border-[#dce4ed]",
  personal: "bg-[#f4f6f8] text-[#5a647d] border-[#dce4ed]",
  health: "bg-[#ecfdf5] text-[#10b981] border-[#86efac]",
  study: "bg-[#fef3c7] text-[#f59e0b] border-[#fcd34d]",
  family: "bg-[#fce7f3] text-[#ec4899] border-[#f9a8d4]",
  shopping: "bg-[#fff7ed] text-[#f97316] border-[#fdba74]",
  finance: "bg-[#fee2e2] text-[#ef4444] border-[#fca5a5]",
  other: "bg-[#f4f6f8] text-[#52525b] border-[#e4e4e7]",
};

const PRIORITY_COLORS = {
  low: "text-[#a1a1aa]",
  medium: "text-[#5a647d]",
  high: "text-[#f97316]",
  urgent: "text-[#ef4444]",
};

const PRIORITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export default function TaskCard({ task, onComplete, onDelete, onEdit, onClick, onSubtaskToggle }) {
  const [expanded, setExpanded] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false); // Added state for share card

  // 查询子任务
  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task.id,
    initialData: [],
  });

  const CategoryIcon = CATEGORY_ICONS[task.category] || MoreHorizontal;
  const isCompleted = task.status === "completed";
  const isSnoozed = task.status === "snoozed";
  const isPast = new Date(task.reminder_time) < new Date() && !isCompleted && !isSnoozed;
  const hasSubtasks = subtasks.length > 0;

  // 计算子任务完成进度
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
              : isSnoozed
              ? 'border-l-[3px] border-l-[#fbbf24]'
              : isPast
              ? 'border-l-[3px] border-l-[#ef4444]'
              : 'hover:translate-y-[-1px]'
          }`}
        >
          {/* 主任务 */}
          <div className="p-5">
            <div className="flex items-start gap-4">
              <Checkbox
              checked={isCompleted}
              onCheckedChange={(e) => {
                e?.stopPropagation?.();
                onComplete();
              }}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-5 w-5 rounded-[6px] data-[state=checked]:bg-[#10b981] border-[#dce4ed]"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={onClick}>
                    {hasSubtasks && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(!expanded);
                        }}
                        className="hover:bg-purple-100 rounded p-1 transition-colors"
                      >
                        {expanded ? (
                          <ChevronDown className="w-4 h-4 text-purple-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-purple-600" />
                        )}
                      </button>
                    )}
                    <h3 className={`text-[17px] font-semibold tracking-tight ${
                      isCompleted ? 'line-through text-[#a1a1aa]' : 'text-[#222222]'
                    }`}>
                      {task.title}
                    </h3>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowShareCard(true);
                      }}
                      className="h-8 w-8 hover:bg-purple-100 hover:text-purple-600 rounded-lg"
                      title="分享任务"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                      }}
                      className="h-8 w-8 hover:bg-blue-100 hover:text-blue-600 rounded-lg"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      className="h-8 w-8 hover:bg-red-100 hover:text-red-600 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {task.description && (
                  <p className="text-[15px] text-[#52525b] mb-3 line-clamp-2 cursor-pointer leading-relaxed" onClick={onClick}>
                    {task.description}
                  </p>
                )}

                {hasSubtasks && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] text-[#a1a1aa]">子任务进度</span>
                      <span className="text-[13px] font-semibold text-[#5a647d]">
                        {completedSubtasks}/{subtasks.length} 已完成 ({progress}%)
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`${CATEGORY_COLORS[task.category]} border rounded-[8px] text-[13px] font-medium`}
                  >
                    <CategoryIcon className="w-3 h-3 mr-1" />
                    {task.category}
                  </Badge>

                  <Badge
                    variant="outline"
                    className="rounded-[8px] text-[13px] border-[#dce4ed]"
                  >
                    <Clock className={`w-3 h-3 mr-1 ${PRIORITY_COLORS[task.priority]}`} />
                    {format(new Date(isSnoozed ? task.snooze_until : task.reminder_time), "M月d日 HH:mm", { locale: zhCN })}
                  </Badge>

                  {getRecurrenceText() && (
                    <Badge variant="outline" className="rounded-[8px] text-[13px] border-[#dce4ed]">
                      <Repeat className="w-3 h-3 mr-1 text-[#5a647d]" />
                      {getRecurrenceText()}
                    </Badge>
                  )}

                  <Badge
                    variant="outline"
                    className={`${PRIORITY_COLORS[task.priority]} border-current rounded-[8px] text-[13px]`}
                  >
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {PRIORITY_LABELS[task.priority]}
                  </Badge>

                  {hasSubtasks && (
                    <Badge className="bg-[#5a647d] text-white rounded-[8px] text-[13px]">
                      {subtasks.length} 个子任务
                    </Badge>
                  )}

                  {task.persistent_reminder && (
                    <Badge className="bg-purple-500 text-white rounded-lg">
                      <Bell className="w-3 h-3 mr-1" />
                      持续提醒
                    </Badge>
                  )}

                  {task.advance_reminders && task.advance_reminders.length > 0 && (
                    <Badge variant="outline" className="rounded-lg text-blue-600 border-blue-300">
                      <Volume2 className="w-3 h-3 mr-1" />
                      提前{task.advance_reminders.length}次
                    </Badge>
                  )}

                  {task.attachments && task.attachments.length > 0 && (
                    <Badge variant="outline" className="rounded-lg text-green-600 border-green-300">
                      <FileText className="w-3 h-3 mr-1" />
                      {task.attachments.length}个附件
                    </Badge>
                  )}

                  {task.notes && task.notes.length > 0 && (
                    <Badge variant="outline" className="rounded-lg text-amber-600 border-amber-300">
                      <StickyNote className="w-3 h-3 mr-1" />
                      {task.notes.length}条笔记
                    </Badge>
                  )}

                  {isSnoozed && (
                    <Badge className="bg-yellow-500 text-white rounded-lg">
                      <TimerReset className="w-3 h-3 mr-1" />
                      已推迟 {task.snooze_count}次
                    </Badge>
                  )}

                  {isPast && !isCompleted && !isSnoozed && (
                    <Badge className="bg-red-500 text-white rounded-lg">
                      已过期
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 子任务列表 */}
          <AnimatePresence>
            {expanded && hasSubtasks && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t-2 border-purple-100 bg-purple-50/30"
              >
                {subtasks.map((subtask, subIndex) => {
                  const isSubtaskCompleted = subtask.status === "completed";
                  // 尝试从标题中提取序号，如果没有则使用索引
                  const titleMatch = subtask.title.match(/^(\d+)\.\s*/);
                  const orderNumber = titleMatch ? titleMatch[1] : (subIndex + 1);
                  const cleanTitle = titleMatch ? subtask.title.replace(/^\d+\.\s*/, '') : subtask.title;

                  return (
                    <motion.div
                      key={subtask.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`px-5 py-3 ml-9 border-l-2 transition-all ${
                        isSubtaskCompleted
                          ? 'border-green-300 bg-green-50/30'
                          : 'border-purple-300 hover:bg-white/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* 子任务序号标识 */}
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSubtaskCompleted
                            ? 'bg-green-500 text-white'
                            : 'bg-purple-500 text-white'
                        }`}>
                          {isSubtaskCompleted ? '✓' : orderNumber}
                        </div>

                        <Checkbox
                          checked={isSubtaskCompleted}
                          onCheckedChange={(e) => {
                            e?.stopPropagation?.();
                            onSubtaskToggle?.(subtask);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded data-[state=checked]:bg-green-500 mt-0.5"
                        />

                        <div className="flex-1">
                          <span className={`block text-sm font-medium mb-1 ${
                            isSubtaskCompleted
                              ? 'line-through text-slate-400'
                              : 'text-slate-700'
                          }`}>
                            {cleanTitle}
                          </span>

                          {subtask.description && (
                            <p className="text-xs text-slate-500 mb-2">{subtask.description}</p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              <Clock className={`w-3 h-3 mr-1 ${PRIORITY_COLORS[subtask.priority]}`} />
                              {format(new Date(subtask.reminder_time), "M月d日 HH:mm", { locale: zhCN })}
                            </Badge>
                            <Badge className={`text-xs ${
                              isSubtaskCompleted
                                ? 'bg-green-500 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {isSubtaskCompleted ? '✅ 已完成' : '📌 待完成'}
                            </Badge>
                            {isSubtaskCompleted && subtask.completed_at && (
                              <Badge variant="outline" className="text-xs text-green-600">
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
      <TaskShareCard
        task={task}
        open={showShareCard}
        onClose={() => setShowShareCard(false)}
      />
    </>
  );
}