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
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  work: "bg-blue-100 text-blue-700 border-blue-200",
  personal: "bg-purple-100 text-purple-700 border-purple-200",
  health: "bg-green-100 text-green-700 border-green-200",
  study: "bg-yellow-100 text-yellow-700 border-yellow-200",
  family: "bg-pink-100 text-pink-700 border-pink-200",
  shopping: "bg-orange-100 text-orange-700 border-orange-200",
  finance: "bg-red-100 text-red-700 border-red-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const PRIORITY_COLORS = {
  low: "text-slate-500",
  medium: "text-blue-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

const PRIORITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export default function TaskCard({ task, onComplete, onDelete, onEdit, onClick, onSubtaskToggle }) {
  const [expanded, setExpanded] = useState(false);
  
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      layout
    >
      <Card 
        className={`group border-0 shadow-lg hover:shadow-xl transition-all duration-300 ${
          isCompleted 
            ? 'bg-slate-50/50 opacity-70' 
            : isSnoozed
            ? 'bg-yellow-50/50 border-l-4 border-l-yellow-400'
            : isPast 
            ? 'bg-red-50/50 border-l-4 border-l-red-400' 
            : 'bg-white hover:scale-[1.01]'
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
              className="mt-1 h-5 w-5 rounded-lg data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-green-500 data-[state=checked]:to-emerald-500"
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
                  <h3 className={`text-lg font-semibold ${
                    isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
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
                <p className="text-sm text-slate-600 mb-3 line-clamp-2 cursor-pointer" onClick={onClick}>
                  {task.description}
                </p>
              )}

              {hasSubtasks && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500">子任务进度</span>
                    <span className="text-xs font-semibold text-purple-600">
                      {completedSubtasks}/{subtasks.length} 已完成 ({progress}%)
                    </span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={`${CATEGORY_COLORS[task.category]} border rounded-lg`}
                >
                  <CategoryIcon className="w-3 h-3 mr-1" />
                  {task.category}
                </Badge>

                <Badge 
                  variant="outline"
                  className="rounded-lg"
                >
                  <Clock className={`w-3 h-3 mr-1 ${PRIORITY_COLORS[task.priority]}`} />
                  {format(new Date(isSnoozed ? task.snooze_until : task.reminder_time), "M月d日 HH:mm", { locale: zhCN })}
                </Badge>

                {getRecurrenceText() && (
                  <Badge variant="outline" className="rounded-lg">
                    <Repeat className="w-3 h-3 mr-1 text-purple-500" />
                    {getRecurrenceText()}
                  </Badge>
                )}

                <Badge 
                  variant="outline"
                  className={`${PRIORITY_COLORS[task.priority]} border-current rounded-lg`}
                >
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {PRIORITY_LABELS[task.priority]}
                </Badge>

                {hasSubtasks && (
                  <Badge className="bg-purple-500 text-white rounded-lg">
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
              {subtasks.map((subtask) => (
                <motion.div
                  key={subtask.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="px-5 py-3 ml-9 border-l-2 border-purple-300 hover:bg-white/50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={subtask.status === "completed"}
                      onCheckedChange={(e) => {
                        e?.stopPropagation?.();
                        onSubtaskToggle?.(subtask);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded data-[state=checked]:bg-green-500"
                    />
                    <span className={`flex-1 text-sm ${
                      subtask.status === "completed" 
                        ? 'line-through text-slate-400' 
                        : 'text-slate-700'
                    }`}>
                      {subtask.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Clock className={`w-3 h-3 mr-1 ${PRIORITY_COLORS[subtask.priority]}`} />
                        {format(new Date(subtask.reminder_time), "M月d日 HH:mm", { locale: zhCN })}
                      </Badge>
                      {subtask.status === "completed" && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}