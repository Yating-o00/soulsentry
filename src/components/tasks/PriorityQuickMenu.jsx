import React from "react";
import { Flag, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import feedback from "@/lib/feedback.jsx";

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "紧急 · 置顶", emoji: "🔥", className: "text-red-600" },
  { value: "high", label: "高", emoji: "⚡", className: "text-orange-600" },
  { value: "medium", label: "中", emoji: "📌", className: "text-stone-600" },
  { value: "low", label: "低", emoji: "📋", className: "text-stone-400" },
];

const labelOf = (p) =>
  p === "urgent" ? "紧急" : p === "high" ? "高" : p === "low" ? "低" : "中";

/**
 * 优先级快速调整菜单
 * - 点击徽章直接切换约定的优先级（urgent=置顶）
 * - 与 SoulSentry 自然语言指令"置顶约定 XXX"形成双通道
 */
export default function PriorityQuickMenu({ task, onUpdateTask, compact = false }) {
  const current = task.priority || "medium";
  const isHigh = current === "urgent" || current === "high";

  const handleChange = (next) => {
    if (next === current) return;
    if (!onUpdateTask) return;
    onUpdateTask(task, { priority: next });
    if (next === "urgent") {
      feedback.success(`📌 已将「${task.title}」置顶`);
    } else {
      feedback.success(`已将优先级调整为「${labelOf(next)}」`);
    }
  };

  // 不可编辑：保持只读外观
  if (!onUpdateTask) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border",
        isHigh ? "bg-red-50 text-red-600 border-red-100" : "bg-stone-50 text-stone-600 border-stone-100"
      )}>
        <Flag className="w-3 h-3" />
        {labelOf(current)}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors cursor-pointer",
            isHigh
              ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-100"
              : "bg-stone-50 text-stone-600 border-stone-100 hover:bg-stone-100 hover:border-stone-200"
          )}
          title="点击调整优先级"
        >
          <Flag className="w-3 h-3" />
          {labelOf(current)}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel className="text-[11px] text-stone-500 font-normal">
          调整优先级
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRIORITY_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={(e) => {
              e.stopPropagation();
              handleChange(opt.value);
            }}
            className={cn(
              "flex items-center gap-2 text-sm cursor-pointer",
              current === opt.value && "bg-stone-50 font-medium"
            )}
          >
            <span className="text-base">{opt.emoji}</span>
            <span className={opt.className}>{opt.label}</span>
            {current === opt.value && (
              <span className="ml-auto text-[10px] text-stone-400">当前</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[10px] text-stone-400 flex items-start gap-1.5 leading-relaxed">
          <Sparkles className="w-3 h-3 mt-0.5 text-[#384877]/60 flex-shrink-0" />
          也可以对 SoulSentry 说"置顶约定 {task.title?.slice(0, 8) || "XXX"}"
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}