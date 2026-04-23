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
    bg: "bg-gradient-to-br from-emerald-50 via-white to-emerald-100/60",
    border: "border-emerald-300/80",
    ring: "shadow-[0_6px_20px_-6px_rgba(16,185,129,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]",
    glow: "bg-emerald-400/20",
    text: "text-emerald-600",
    badgeBg: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    badgeText: "text-white",
    label: "已完成",
    icon: Check,
  },
  running: {
    bg: "bg-gradient-to-br from-indigo-50 via-white to-blue-100/60",
    border: "border-indigo-300/80",
    ring: "shadow-[0_6px_22px_-4px_rgba(99,102,241,0.5),inset_0_1px_0_rgba(255,255,255,0.9)]",
    glow: "bg-indigo-400/30 animate-pulse",
    text: "text-indigo-600",
    badgeBg: "bg-gradient-to-br from-indigo-400 to-blue-600",
    badgeText: "text-white",
    label: "执行中",
    icon: Loader2,
    spin: true,
    pulseRing: true,
  },
  failed: {
    bg: "bg-gradient-to-br from-red-50 via-white to-rose-100/60",
    border: "border-red-300/80",
    ring: "shadow-[0_6px_20px_-6px_rgba(239,68,68,0.45),inset_0_1px_0_rgba(255,255,255,0.9)]",
    glow: "bg-red-400/20",
    text: "text-red-600",
    badgeBg: "bg-gradient-to-br from-red-400 to-rose-600",
    badgeText: "text-white",
    label: "失败",
    icon: AlertCircle,
  },
  pending: {
    bg: "bg-gradient-to-br from-slate-50 to-slate-100/80",
    border: "border-slate-200",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
    glow: "",
    text: "text-slate-400",
    badgeBg: "bg-slate-200",
    badgeText: "text-slate-500",
    label: "待触发",
    icon: Circle,
    muted: true,
  },
  todo: {
    bg: "bg-gradient-to-br from-white to-indigo-50/40",
    border: "border-indigo-200",
    ring: "shadow-[0_3px_10px_-4px_rgba(99,102,241,0.25),inset_0_1px_0_rgba(255,255,255,0.9)]",
    glow: "",
    text: "text-indigo-500",
    badgeBg: "bg-white",
    badgeText: "text-indigo-500",
    label: "待执行",
    icon: Circle,
  },
  skipped: {
    bg: "bg-slate-50/50",
    border: "border-slate-200 border-dashed",
    ring: "",
    glow: "",
    text: "text-slate-400",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-400",
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
      <div className="relative">
        {/* 环境光晕 */}
        {theme.glow && (
          <div
            className={`absolute inset-0 rounded-2xl blur-xl ${theme.glow}`}
            aria-hidden="true"
          />
        )}
        {/* 执行中呼吸环 */}
        {theme.pulseRing && (
          <div
            className="absolute -inset-1 rounded-3xl border border-indigo-300/40 animate-ping"
            aria-hidden="true"
          />
        )}
        <div
          className={`relative w-14 h-14 rounded-2xl border ${theme.bg} ${theme.border} ${theme.ring} flex items-center justify-center transition-all duration-300 ${
            interactive ? "group-hover:scale-[1.08] group-hover:-translate-y-0.5 group-active:scale-95" : ""
          }`}
        >
          <span
            className={`text-2xl leading-none drop-shadow-sm ${isSkipped ? "grayscale opacity-50" : ""}`}
          >
            {emoji}
          </span>
          {/* 顶部高光 */}
          <div className="pointer-events-none absolute inset-x-1.5 top-1 h-1/3 rounded-xl bg-gradient-to-b from-white/70 to-transparent opacity-80" aria-hidden="true" />
          {/* 状态角标 */}
          <div
            className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full ${theme.badgeBg} ring-2 ring-white shadow-sm flex items-center justify-center`}
          >
            <Icon
              className={`w-3 h-3 ${theme.badgeText} ${theme.spin ? "animate-spin" : ""}`}
              strokeWidth={3}
            />
          </div>
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