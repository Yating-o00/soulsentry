import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Check,
  Calendar,
  Clock,
  Paperclip,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Briefcase,
  Flag,
  FileText,
  Trash2,
  Edit,
  Share2,
  Languages,
  CheckCircle2,
  MessageSquare,
  Link2,
  StickyNote,
  Bell,
  History
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import TaskMemoryInsight from "@/components/memory/TaskMemoryInsight";
import MilestoneTimeEditor from "@/components/tasks/MilestoneTimeEditor";
import SubtaskContextBadges from "@/components/tasks/SubtaskContextBadges";

export default function MilestoneCard({
  task,
  subtasks = [],
  commentCount = 0,
  onToggleSubtask,
  onUpdateStatus,
  onAddSubtask,
  onEdit,
  onView,
  onUpdate,
  onDelete,
  onShare,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
  onViewTab
}) {
  const [expanded, setExpanded] = useState(false);
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((t) => t.status === 'completed').length;
  const progress = totalSubtasks > 0 ? Math.round(completedSubtasks / totalSubtasks * 100) : task.progress || 0;
  const isCompleted = task.status === 'completed';

  const getTimeText = () => {
    if (!task.reminder_time) return "待定";
    const date = new Date(task.reminder_time);
    const now = new Date();
    // 按"自然日"计算，而非 24 小时毫秒差，避免"今晚→明早"被算成 0 天
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / (1000 * 60 * 60 * 24));
    // 用完整时间戳判断"已过期"（已到截止时刻且未完成）
    if (date.getTime() < now.getTime() && diffDays <= 0) return "已过期";
    if (diffDays === 0) return "今天截止";
    if (diffDays === 1) return "明天截止";
    if (diffDays < 0) return `${Math.abs(diffDays)}天前`;
    return `${diffDays}天后`;
  };

  const getCategoryLabel = () => {
    switch (task.category) {
      case 'work': return '工作';
      case 'personal': return '生活';
      case 'health': return '健康';
      case 'study': return '学习';
      case 'family': return '家庭';
      case 'shopping': return '购物';
      case 'finance': return '财务';
      default: return '生活';
    }
  };

  const getCategoryIcon = () => {
    const title = (task.title || '').toLowerCase();
    switch (task.category) {
      case 'work': return '📝';
      case 'health': return '🌱';
      case 'study': return '📖';
      case 'family': return '👨\u200d👩\u200d👧';
      case 'shopping': return '🛒';
      case 'finance': return '💰';
      default: // personal/other - smart icon based on title
        if (/书|阅读|读|看书/.test(title)) return '📚';
        if (/跑步|运动|健身/.test(title)) return '🏃';
        if (/做饭|烹饪|煮/.test(title)) return '🍳';
        if (/打扫|清洁|洗|整理/.test(title)) return '🧹';
        if (/旅行|出行|机票/.test(title)) return '✈️';
        if (/电影|看剧/.test(title)) return '🎬';
        if (/睡|休息|午休/.test(title)) return '😴';
        if (/寄|快递|带/.test(title)) return '📦';
        if (/药|吃药|医/.test(title)) return '💊';
        if (/喝水|咖啡|茶/.test(title)) return '☕';
        if (/浇花|植物/.test(title)) return '🌸';
        return '⚡';
    }
  };

  return (
    <div
      onClick={(e) => {
        if (isSelectionMode) {
          e.stopPropagation();
          onToggleSelection && onToggleSelection();
        } else {
          setExpanded(!expanded);
        }
      }}
      className={cn(
        "task-card group bg-white rounded-2xl shadow-sm border border-stone-100 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
        "border-l-[3px] border-l-[#384877]",
        isCompleted && "opacity-60",
        isSelected && "ring-2 ring-blue-500 bg-blue-50/30"
      )}
    >
      {isSelectionMode && (
        <div className="absolute top-4 right-4 z-20">
          <div className={cn(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
            isSelected ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"
          )}>
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
      )}

      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-16 -mt-16 opacity-30 pointer-events-none bg-blue-100" />

      {/* Main Content Area */}
      <div className="p-5 relative z-10">
        {/* Header Tags */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-500 px-2 py-1 text-xs font-medium rounded-lg flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {getCategoryLabel()}
            </span>
            <span className="px-2 py-1 bg-stone-100 text-stone-600 text-xs rounded-lg font-medium flex items-center gap-1">
              <Flag className="w-3 h-3" />
              里程碑
            </span>
            {task.priority === 'urgent' && (
              <span className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded-lg font-medium flex items-center gap-1">
                <Flag className="w-3 h-3" />
                紧急
              </span>
            )}
            {task.dependencies?.length > 0 && (
              <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("dependencies"); }} className="px-2 py-1 bg-amber-50 text-amber-600 text-xs rounded-lg font-medium flex items-center gap-1 cursor-pointer hover:bg-amber-100 transition-colors">
                <Link2 className="w-3 h-3" />
                {task.dependencies.length}
              </span>
            )}
            {task.attachments?.length > 0 && (
              <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("attachments"); }} className="px-2 py-1 bg-purple-50 text-purple-600 text-xs rounded-lg font-medium flex items-center gap-1 cursor-pointer hover:bg-purple-100 transition-colors">
                <Paperclip className="w-3 h-3" />
                {task.attachments.length}
              </span>
            )}
            {task.notes?.length > 0 && (
              <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("notes"); }} className="px-2 py-1 bg-teal-50 text-teal-600 text-xs rounded-lg font-medium flex items-center gap-1 cursor-pointer hover:bg-teal-100 transition-colors">
                <StickyNote className="w-3 h-3" />
                {task.notes.length}
              </span>
            )}
            {commentCount > 0 && (
              <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("comments"); }} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-lg font-medium flex items-center gap-1 cursor-pointer hover:bg-blue-100 transition-colors">
                <MessageSquare className="w-3 h-3" />
                {commentCount}
              </span>
            )}
            {(task.advance_reminders?.length > 0 || task.persistent_reminder) && (
              <span onClick={(e) => { e.stopPropagation(); onViewTab && onViewTab("reminders"); }} className="px-2 py-1 bg-orange-50 text-orange-600 text-xs rounded-lg font-medium flex items-center gap-1 cursor-pointer hover:bg-orange-100 transition-colors">
                <Bell className="w-3 h-3" />
              </span>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1">
              <DropdownMenuLabel className="text-xs font-medium text-stone-500 px-2 py-1.5">
                快速操作
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-stone-100 my-1" />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(task, isCompleted ? 'in_progress' : 'completed'); }}
                className="flex items-center gap-2 px-2 py-2 text-sm text-stone-700 rounded-lg hover:bg-stone-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-stone-500" />
                <span>{isCompleted ? '标记未完成' : '标记完成'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onEdit && onEdit(); }}
                className="flex items-center gap-2 px-2 py-2 text-sm text-stone-700 rounded-lg hover:bg-stone-50 cursor-pointer"
              >
                <Edit className="w-4 h-4 text-stone-500" />
                <span>编辑约定</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onView && onView(); }}
                className="flex items-center gap-2 px-2 py-2 text-sm text-stone-700 rounded-lg hover:bg-stone-50 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-stone-500" />
                <span>查看详情</span>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2 px-2 py-2 text-sm text-stone-700 rounded-lg hover:bg-stone-50 cursor-pointer">
                  <Flag className="w-4 h-4 text-stone-500" />
                  <span>优先级</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onUpdate(task, { priority: 'urgent' })}>
                    <span className="w-2 h-2 rounded-full bg-red-500 mr-2" /> 紧急
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUpdate(task, { priority: 'high' })}>
                    <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" /> 高
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUpdate(task, { priority: 'medium' })}>
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" /> 中
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUpdate(task, { priority: 'low' })}>
                    <span className="w-2 h-2 rounded-full bg-slate-400 mr-2" /> 低
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onShare && onShare(task); }}
                className="flex items-center gap-2 px-2 py-2 text-sm text-stone-700 rounded-lg hover:bg-stone-50 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-stone-500" />
                <span>分享约定</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center gap-2 px-2 py-2 text-sm text-stone-700 rounded-lg hover:bg-stone-50 cursor-pointer">
                <Languages className="w-4 h-4 text-stone-500" />
                <span>翻译</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-stone-100 my-1" />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete && onDelete(task); }}
                className="flex items-center gap-2 px-2 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 cursor-pointer focus:bg-red-50 focus:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                <span>移至回收站</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content Body */}
        <div className="flex gap-4">
          {/* Icon with Progress Ring */}
          <div className="flex-shrink-0 relative">
            {totalSubtasks > 0 ? (
              <div className="relative w-14 h-14 flex items-center justify-center -ml-1 -mt-1">
                <svg className="w-14 h-14 -rotate-90 absolute">
                  <circle cx="28" cy="28" r="26" fill="none" stroke="#F1F5F9" strokeWidth="3" />
                  <circle
                    cx="28" cy="28" r="26" fill="none"
                    stroke={isCompleted ? "#10B981" : "#3B82F6"}
                    strokeWidth="3"
                    strokeDasharray={163.3}
                    strokeDashoffset={163.3 - progress / 100 * 163.3}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 z-10">
                  <span className="text-xs font-bold">{progress}%</span>
                </div>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-2xl shadow-inner">
                {getCategoryIcon()}
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-stone-800 mb-1 truncate text-base",
              isCompleted && "line-through text-stone-400"
            )}>
              {task.title}
            </h3>
            <p className="text-sm text-stone-500 mb-2 line-clamp-1">
              {task.description || "暂无描述"}
            </p>

            {/* Metadata Line */}
            <div className="flex items-center gap-3 text-xs">
              <MilestoneTimeEditor
                task={task}
                onSave={(payload) => onUpdate && onUpdate(task, payload)}
              >
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-stone-400 hover:text-[#384877] hover:bg-stone-50 px-1.5 py-0.5 -ml-1.5 rounded transition-colors cursor-pointer"
                  title="点击编辑时间"
                >
                  <Calendar className="w-3 h-3" />
                  {(() => {
                    const fmt = (iso) => format(new Date(iso), 'M月d日 HH:mm', { locale: zhCN });
                    // 只有当用户显式设置了起始时间（即与 end_time 不在同一天）时才显示为范围
                    // 否则 reminder_time 通常是"提前提醒"自动算出的，不应作为起始时间展示
                    if (task.reminder_time && task.end_time) {
                      const r = new Date(task.reminder_time);
                      const e = new Date(task.end_time);
                      const sameDay = r.getFullYear() === e.getFullYear() && r.getMonth() === e.getMonth() && r.getDate() === e.getDate();
                      if (!sameDay) return `${fmt(task.reminder_time)} → ${fmt(task.end_time)}`;
                      return `截止 ${fmt(task.end_time)}`;
                    }
                    if (task.end_time) return `截止 ${fmt(task.end_time)}`;
                    if (task.reminder_time) return fmt(task.reminder_time);
                    return '点击设置时间';
                  })()}
                </button>
              </MilestoneTimeEditor>
              <span className="w-1 h-1 rounded-full bg-stone-300"></span>
              <span className="flex items-center gap-1 text-stone-400">
                <Clock className="w-3 h-3" />
                {totalSubtasks > 0 ? `${completedSubtasks}/${totalSubtasks} 子任务` : '预计2小时'}
              </span>
            </div>

            {/* AI Memory Insight */}
            <TaskMemoryInsight task={task} />
          </div>

          {/* Right Action */}
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus(task, isCompleted ? 'in_progress' : 'completed');
              }}
              className={cn(
                "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all group",
                isCompleted
                  ? "border-green-500 bg-green-50 text-green-600"
                  : "border-stone-200 hover:border-green-500 hover:bg-green-50 text-stone-300 hover:text-green-600"
              )}
            >
              <Check className="w-5 h-5" />
            </button>
            <span className={cn("text-xs font-medium", "text-stone-400")}>
              {getTimeText()}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Subtasks Area */}
      {(expanded || (subtasks.length > 0 && !isCompleted)) && (
        <div className={cn(
          "bg-stone-50/50 border-t border-stone-100 transition-all duration-300 ease-in-out overflow-hidden",
          expanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
            {subtasks.map((subtask) => (
              <div
                key={subtask.id}
                onClick={(e) => { e.stopPropagation(); onToggleSubtask(subtask); }}
                className={cn(
                  "group flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all bg-white border border-stone-200 hover:border-blue-300",
                  subtask.status === 'completed' && "opacity-60"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors border mt-0.5",
                  subtask.status === 'completed'
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-stone-300 bg-white group-hover:border-blue-400"
                )}>
                  {subtask.status === 'completed' && <Check className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-sm block",
                    subtask.status === 'completed' ? "text-stone-400 line-through" : "text-stone-700"
                  )}>
                    {subtask.title}
                  </span>
                  <SubtaskContextBadges subtask={subtask} />
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={(e) => { e.stopPropagation(); onAddSubtask(); }}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                查看详情或添加子任务
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
              >
                {expanded ? '收起详情' : '查看详情'}
                <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom hint if not expanded but has subtasks */}
      {!expanded && subtasks.length > 0 && (
        <div onClick={() => setExpanded(true)} className="px-5 pb-3 pt-0 flex justify-center">
          <div className="h-1 w-12 bg-stone-200 rounded-full group-hover:bg-blue-200 transition-colors" />
        </div>
      )}
    </div>
  );
}