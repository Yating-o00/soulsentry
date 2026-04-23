import React from "react";
import { Check, Loader2, Circle, AlertCircle, Clock, SkipForward, RotateCcw, Play } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * AI 智能规划 · 执行编排节点流
 *
 * 每个节点支持点击弹出菜单，手动修改状态：
 *   - 标记完成 (completed)
 *   - 标记执行中 (running)
 *   - 跳过 (skipped)
 *   - 重置为待执行 (todo)
 *
 * Props:
 *   steps: Array<Step>
 *   onStepStatusChange?: (index, newStatus) => void
 *     如未提供则节点为展示态（不可交互）
 */

const statusTheme = {
  completed: {
    bg: "bg-emerald-50",
    border: "border-emerald-400",
    ring: "shadow-[0_0_14px_rgba(16,185,129,0.35)]",
    text: "text-emerald-600",
    label: "已完成",
    icon: Check,
  },
  running: {
    bg: "bg-indigo-50",
    border: "border-indigo-400",
    ring: "shadow-[0_0_14px_rgba(99,102,241,0.45)]",
    text: "text-indigo-600",
    label: "执行中",
    icon: Loader2,
    spin: true,
  },
  failed: {
    bg: "bg-red-50",
    border: "border-red-400",
    ring: "shadow-[0_0_14px_rgba(239,68,68,0.35)]",
    text: "text-red-600",
    label: "失败",
    icon: AlertCircle,
  },
  pending: {
    bg: "bg-slate-100",
    border: "border-slate-300",
    ring: "",
    text: "text-slate-400",
    label: "待触发",
    icon: Circle,
    muted: true,
  },
  todo: {
    bg: "bg-white",
    border: "border-indigo-300",
    ring: "",
    text: "text-indigo-500",
    label: "待执行",
    icon: Circle,
  },
  skipped: {
    bg: "bg-slate-50",
    border: "border-slate-200 border-dashed",
    ring: "",
    text: "text-slate-400",
    label: "已跳过",
    icon: SkipForward,
    muted: true,
  },
};

const NUM_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

const StepNode = React.forwardRef(({ step, index, interactive }, ref) => {
  const theme = statusTheme[step.status] || statusTheme.todo;
  const Icon = theme.icon;
  const emoji = step.icon || NUM_EMOJIS[index] || "•";
  const isSkipped = step.status === "skipped";

  return (
    <button
      ref={ref}
      type="button"
      disabled={!interactive}
      onClick={(e) => e.stopPropagation()}
      className={`group flex flex-col items-center gap-1.5 flex-shrink-0 min-w-[68px] ${
        theme.muted ? "opacity-60" : ""
      } ${interactive ? "cursor-pointer" : "cursor-default"} rounded-xl p-1 -m-1 transition-colors ${
        interactive ? "hover:bg-slate-50 active:bg-slate-100" : ""
      }`}
      title={step.detail || step.step_name}
    >
      <div
        className={`relative w-14 h-14 rounded-2xl border-2 ${theme.bg} ${theme.border} ${theme.ring} flex items-center justify-center transition-all ${
          interactive ? "group-hover:scale-105" : ""
        }`}
      >
        <span
          className={`text-2xl leading-none ${isSkipped ? "grayscale opacity-60" : ""}`}
        >
          {emoji}
        </span>
        <div
          className={`absolute -top-1 -right-1 w-5 h-5 rounded-full ${theme.bg} border-2 border-white flex items-center justify-center`}
        >
          <Icon
            className={`w-3 h-3 ${theme.text} ${theme.spin ? "animate-spin" : ""}`}
          />
        </div>
      </div>
      <span
        className={`text-[11px] font-medium text-slate-700 text-center leading-tight max-w-[76px] line-clamp-2 ${
          isSkipped ? "line-through" : ""
        }`}
      >
        {step.step_name}
      </span>
      <span className={`text-[10px] font-medium ${theme.text} leading-none`}>
        {theme.label}
      </span>
      {step.when_hint && (
        <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400 leading-none">
          <Clock className="w-2 h-2" />
          {step.when_hint}
        </span>
      )}
    </button>
  );
});
StepNode.displayName = "StepNode";

const ACTIONS = [
  { key: "completed", label: "标记完成", icon: Check, className: "text-emerald-600" },
  { key: "running", label: "标记执行中", icon: Play, className: "text-indigo-600" },
  { key: "skipped", label: "跳过此步", icon: SkipForward, className: "text-slate-500" },
  { key: "todo", label: "重置为待执行", icon: RotateCcw, className: "text-slate-500" },
];

export default function ExecutionStepFlow({ steps = [], onStepStatusChange }) {
  if (!steps || steps.length === 0) return null;
  const interactive = typeof onStepStatusChange === "function";

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const nextStatus = !isLast ? steps[i + 1]?.status : null;
        const connectorActive =
          step.status === "completed" ||
          step.status === "running" ||
          nextStatus === "running" ||
          nextStatus === "completed";

        const node = <StepNode step={step} index={i} interactive={interactive} />;

        return (
          <React.Fragment key={i}>
            {interactive ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>{node}</DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  className="w-44"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuLabel className="text-[11px] font-normal text-slate-500 truncate">
                    {step.step_name}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ACTIONS.map((a) => {
                    const ActIcon = a.icon;
                    const isCurrent = step.status === a.key;
                    return (
                      <DropdownMenuItem
                        key={a.key}
                        disabled={isCurrent}
                        onSelect={(e) => {
                          e.preventDefault();
                          onStepStatusChange(i, a.key);
                        }}
                        className={`${a.className} text-xs`}
                      >
                        <ActIcon className="w-3.5 h-3.5" />
                        {a.label}
                        {isCurrent && (
                          <span className="ml-auto text-[10px] text-slate-400">当前</span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              node
            )}

            {!isLast && (
              <div className="flex items-center flex-shrink-0 pt-6">
                <div
                  className={`w-6 h-0.5 rounded-full ${
                    connectorActive
                      ? "bg-gradient-to-r from-indigo-300 to-emerald-300"
                      : "bg-slate-200"
                  } ${
                    step.status === "running" || nextStatus === "running"
                      ? "animate-pulse"
                      : ""
                  }`}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}