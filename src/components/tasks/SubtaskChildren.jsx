import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 二级子约定：在任务卡片的一级子约定下，以缩进 + 折叠的方式展示其子级。
 * 默认折叠，只显示一行进度摘要，点击展开缩进列表，避免卡片杂乱。
 */
export default function SubtaskChildren({ subtask, onToggle }) {
  const [open, setOpen] = useState(false);

  const { data: children = [] } = useQuery({
    queryKey: ['subtasks', subtask?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: subtask.id }),
    enabled: !!subtask?.id,
  });

  if (children.length === 0) return null;

  const done = children.filter(c => c.status === 'completed').length;

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 px-1 py-0.5 -ml-1 rounded hover:bg-stone-100/70 transition-colors"
      >
        <ChevronRight className={cn("w-3 h-3 transition-transform", open && "rotate-90")} />
        {done}/{children.length} 二级子约定
      </button>

      {open && (
        <div className="mt-1 ml-1.5 pl-3 border-l-2 border-stone-200 space-y-1">
          {children.map((child) => (
            <div
              key={child.id}
              onClick={() => onToggle && onToggle(child)}
              className={cn(
                "flex items-start gap-2 py-1 px-1.5 rounded-lg transition-colors",
                onToggle && "cursor-pointer hover:bg-stone-100/70"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border mt-0.5 transition-colors",
                child.status === 'completed'
                  ? "bg-green-500 border-green-500 text-white"
                  : "border-stone-300 bg-white"
              )}>
                {child.status === 'completed' && <Check className="w-2.5 h-2.5" />}
              </div>
              <span className={cn(
                "text-xs leading-relaxed",
                child.status === 'completed' ? "text-stone-400 line-through" : "text-stone-600"
              )}>
                {child.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}