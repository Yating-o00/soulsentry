import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Check, 
  Calendar, 
  Clock, 
  Paperclip, 
  User, 
  ChevronDown, 
  MoreHorizontal,
  Loader2,
  CheckCircle2,
  MessageSquare,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function MilestoneCard({ 
  task, 
  subtasks = [], 
  onToggleSubtask, 
  onUpdateStatus,
  onAddSubtask,
  onUpdate,
  onEdit
}) {
  const [expanded, setExpanded] = useState(false);
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter(t => t.status === 'completed').length;
  const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : task.progress || 0;
  
  // Calculate stroke dashoffset for SVG circle (circumference = 2 * PI * 36 ≈ 226.2)
  const circumference = 226.2;
  const offset = circumference - (progress / 100) * circumference;

  const isCompleted = task.status === 'completed';

  return (
    <div className={cn(
      "bg-white rounded-[24px] border border-[#E8E4E0] shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(91,141,184,0.12)] hover:-translate-y-0.5",
      isCompleted && "opacity-80 grayscale-[0.5]"
    )}>
      {/* Header Section */}
      <div className="bg-gradient-to-br from-[#FAFBFC] to-[#F0F4F8] border-b border-[#E8E4E0] rounded-t-[24px] p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-5 flex-1">
            {/* Progress Ring */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#E8E4E0" strokeWidth="4"/>
                <circle 
                  cx="40" 
                  cy="40" 
                  r="36" 
                  fill="none" 
                  stroke={isCompleted ? "#A8B5A0" : "#5B8DB8"} 
                  strokeWidth="4" 
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round" 
                  className="transition-[stroke-dashoffset] duration-600 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[#2C3E50]">{progress}</span>
                <span className="text-[10px] text-stone-400 uppercase tracking-wider">%</span>
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full tracking-wide">
                  里程碑
                </span>
                <span className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-full flex items-center gap-1",
                  isCompleted ? "bg-green-100 text-green-700" : "bg-amber-50 text-amber-700"
                )}>
                  {isCompleted ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> 已完成
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> 进行中
                    </>
                  )}
                </span>
                {task.reminder_time && (
                  <span className="text-xs text-stone-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    截止 {format(new Date(task.reminder_time), 'M月d日', { locale: zhCN })}
                  </span>
                )}
              </div>
              
              <h2 className={cn(
                "font-serif text-2xl font-semibold text-[#2C3E50] mb-2 leading-tight",
                isCompleted && "line-through text-stone-500"
              )}>
                {task.title}
              </h2>
              <p className="text-sm text-stone-500 mb-4 leading-relaxed line-clamp-2">
                {task.description || "暂无描述"}
              </p>
              
              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {completedSubtasks}/{totalSubtasks} 子约定
                </span>
                {task.attachments?.length > 0 && (
                  <span className="flex items-center gap-1.5 text-blue-600">
                    <Paperclip className="w-3.5 h-3.5" />
                    {task.attachments.length} 个附件
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setExpanded(!expanded)} 
              className={cn(
                "p-2 hover:bg-white/50 rounded-full transition-all duration-300",
                expanded && "rotate-180 bg-white shadow-sm"
              )}
            >
              <ChevronDown className="w-5 h-5 text-stone-400" />
            </button>
            <button className="p-2 hover:bg-white/50 rounded-full transition-colors">
              <MoreHorizontal className="w-5 h-5 text-stone-400" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Subtasks Section */}
      {(expanded || subtasks.length > 0) && (
        <div className={cn(
          "px-6 md:px-8 space-y-2 transition-all duration-500 ease-in-out overflow-hidden",
          expanded ? "py-6 max-h-[1000px] opacity-100" : "max-h-0 py-0 opacity-0"
        )}>
          {subtasks.map((subtask) => (
            <div 
              key={subtask.id}
              onClick={() => onToggleSubtask(subtask)}
              className={cn(
                "group flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border-l-[3px] relative overflow-hidden",
                subtask.status === 'completed' 
                  ? "bg-stone-50 border-[#A8B5A0] opacity-80" 
                  : "bg-white border-[#E8E4E0] hover:bg-[#FAFBFC] hover:border-[#5B8DB8]"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors shadow-sm",
                subtask.status === 'completed' 
                  ? "bg-green-500" 
                  : "border-2 border-stone-300 bg-white group-hover:border-[#5B8DB8]"
              )}>
                {subtask.status === 'completed' ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-[#5B8DB8] opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
              <div className="flex-1">
                <p className={cn(
                  "text-sm font-medium transition-colors",
                  subtask.status === 'completed' ? "text-stone-500 line-through decoration-stone-300" : "text-stone-700"
                )}>
                  {subtask.title}
                </p>
                {subtask.status === 'completed' && (
                  <p className="text-xs text-stone-400 mt-0.5">已完成</p>
                )}
              </div>
              {subtask.status === 'completed' && (
                <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">
                  已完成
                </span>
              )}
            </div>
          ))}
          
          {subtasks.length === 0 && (
            <div className="text-center py-4 text-stone-400 text-sm">暂无子约定</div>
          )}
        </div>
      )}
      
      {/* Footer Actions - only visible when expanded */}
      {expanded && (
        <div className="px-6 md:px-8 pb-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between pt-4 border-t border-stone-100">
            <div className="flex items-center gap-2">
              <button 
                onClick={onAddSubtask}
                className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加子约定
              </button>
              <button className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors">
                <MessageSquare className="w-3.5 h-3.5" />
                备注
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-400">更新于 {format(new Date(task.updated_date || task.created_date), 'HH:mm')}</span>
              <button 
                onClick={() => onUpdateStatus(task, task.status === 'completed' ? 'in_progress' : 'completed')}
                className={cn(
                  "px-4 py-2 text-white text-xs font-medium rounded-lg transition-colors shadow-sm",
                  task.status === 'completed' 
                    ? "bg-stone-400 hover:bg-stone-500" 
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                )}
              >
                {task.status === 'completed' ? '重新开启' : '更新进度'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}