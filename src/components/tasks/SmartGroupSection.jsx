import React from "react";
import { cn } from "@/lib/utils";
import LifeTaskCard from "./LifeTaskCard";

/**
 * 智能分组容器 - 显示一组通过AI规则归类的约定
 */
export default function SmartGroupSection({
  title,
  description,
  icon: Icon,
  iconBg,
  iconColor,
  tasks,
  emptyHint,
  getSubtasks,
  commentCountMap,
  isSelectionMode,
  selectedTaskIds,
  onToggleSelection,
  onToggleSubtask,
  onComplete,
  onEdit,
  onShare,
  onViewTab,
}) {
  if (!tasks || tasks.length === 0) {
    if (!emptyHint) return null;
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
            <Icon className={cn("w-5 h-5", iconColor)} />
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold text-stone-800">{title}</h3>
            <p className="text-sm text-stone-500">{description}</p>
          </div>
        </div>
        <div className="text-sm text-stone-400 italic px-2 py-6 text-center bg-stone-50/60 rounded-2xl border border-dashed border-stone-200">
          {emptyHint}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
            <Icon className={cn("w-5 h-5", iconColor)} />
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold text-stone-800">{title}</h3>
            <p className="text-sm text-stone-500">{description}</p>
          </div>
        </div>
        <span className="text-xs text-stone-400">{tasks.length} 个</span>
      </div>

      <div className="flex flex-col gap-4">
        {tasks.map((task) => (
          <LifeTaskCard
            key={task.id}
            task={task}
            subtasks={getSubtasks(task.id)}
            commentCount={commentCountMap[task.id] || 0}
            isSelectionMode={isSelectionMode}
            isSelected={selectedTaskIds.includes(task.id)}
            onToggleSelection={() => onToggleSelection(task.id)}
            onToggleSubtask={onToggleSubtask}
            onComplete={onComplete}
            onEdit={() => onEdit(task)}
            onShare={() => onShare(task)}
            onViewTab={(tab) => onViewTab(task, tab)}
          />
        ))}
      </div>
    </div>
  );
}