import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 二级子约定：在任务卡片的一级子约定下，以缩进 + 折叠的方式展示其子级，
 * 并提供最简的内联添加入口（+ 二级子约定 → 输入 → 回车/确认）。
 */
export default function SubtaskChildren({ subtask, onToggle }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();

  const { data: allChildren = [] } = useQuery({
    queryKey: ['subtasks', subtask?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: subtask.id }),
    enabled: !!subtask?.id,
  });
  const children = allChildren.filter(c => !c.deleted_at);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { deleted_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', subtask.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (t) => base44.entities.Task.create({
      title: t,
      parent_task_id: subtask.id,
      status: 'pending',
      category: subtask.category || 'personal',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', subtask.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTitle("");
    },
  });

  const submit = () => {
    const t = title.trim();
    if (!t || createMutation.isPending) return;
    createMutation.mutate(t);
  };

  const done = children.filter(c => c.status === 'completed').length;

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        {children.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 px-1 py-0.5 -ml-1 rounded hover:bg-stone-100/70 transition-colors"
          >
            <ChevronRight className={cn("w-3 h-3 transition-transform", open && "rotate-90")} />
            {done}/{children.length}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setAdding(true); setOpen(true); }}
          className={cn(
            "flex items-center gap-0.5 text-[11px] px-1 py-0.5 rounded transition-colors",
            children.length > 0
              ? "text-stone-300 hover:text-stone-600 hover:bg-stone-100/70"
              : "text-stone-400 hover:text-stone-600 hover:bg-stone-100/70 -ml-1"
          )}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {(open || adding) && (
        <div className="mt-1 ml-1.5 pl-3 border-l-2 border-stone-200 space-y-1">
          {open && children.map((child) => (
            <div
              key={child.id}
              onClick={() => onToggle && onToggle(child)}
              className={cn(
                "group flex items-start gap-2 py-1 px-1.5 rounded-lg transition-colors",
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
                "flex-1 min-w-0 text-xs leading-relaxed",
                child.status === 'completed' ? "text-stone-400 line-through" : "text-stone-600"
              )}>
                {child.title}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(child.id); }}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-stone-300 hover:text-rose-500 p-0.5 rounded transition-all flex-shrink-0"
                aria-label="删除二级子约定"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {adding && (
            <div className="flex items-center gap-1.5 py-0.5">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                  if (e.key === 'Escape') { setAdding(false); setTitle(""); }
                }}
                placeholder="输入二级子约定，回车添加"
                className="flex-1 min-w-0 text-xs px-2 py-1 rounded-lg border border-stone-200 focus:border-[#384877] focus:outline-none bg-white placeholder:text-stone-300"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!title.trim() || createMutation.isPending}
                className="text-[11px] px-2 py-1 rounded-lg bg-[#384877] text-white disabled:opacity-40 transition-opacity"
              >
                添加
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}