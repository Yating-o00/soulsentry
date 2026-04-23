import React from "react";
import { Check, Loader2, Circle, AlertCircle, Clock } from "lucide-react";

/**
 * AI 智能规划 · 执行编排节点流
 *
 * 含义：AI 对用户输入（约定/任务/愿望）理解后，推导出的现实世界行动步骤 —
 * 以横向"执行节点"形式呈现，每个节点代表一个行动，附带状态与时机提示。
 *
 * 每个 step 数据结构：
 *   - step_name: 节点名称
 *   - detail?: 详情（hover title）
 *   - when_hint?: 时机提示（如"本周内"）
 *   - status?: completed | running | failed | pending | todo
 *   - icon?: emoji 图标（可选，缺省按 status 或序号生成）
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
};

const NUM_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

export default function ExecutionStepFlow({ steps = [] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {steps.map((step, i) => {
        const theme = statusTheme[step.status] || statusTheme.todo;
        const Icon = theme.icon;
        const emoji = step.icon || NUM_EMOJIS[i] || "•";
        const isLast = i === steps.length - 1;
        const nextStatus = !isLast ? steps[i + 1]?.status : null;
        const connectorActive =
          step.status === "completed" ||
          step.status === "running" ||
          nextStatus === "running" ||
          nextStatus === "completed";

        return (
          <React.Fragment key={i}>
            <div
              className={`flex flex-col items-center gap-1.5 flex-shrink-0 min-w-[68px] ${
                theme.muted ? "opacity-60" : ""
              }`}
              title={step.detail || step.step_name}
            >
              {/* 节点主体 */}
              <div
                className={`relative w-14 h-14 rounded-2xl border-2 ${theme.bg} ${theme.border} ${theme.ring} flex items-center justify-center transition-all`}
              >
                <span className="text-2xl leading-none">{emoji}</span>
                {/* 状态角标 */}
                <div
                  className={`absolute -top-1 -right-1 w-5 h-5 rounded-full ${theme.bg} border-2 border-white flex items-center justify-center`}
                >
                  <Icon
                    className={`w-3 h-3 ${theme.text} ${
                      theme.spin ? "animate-spin" : ""
                    }`}
                  />
                </div>
              </div>

              {/* 名称 */}
              <span className="text-[11px] font-medium text-slate-700 text-center leading-tight max-w-[76px] line-clamp-2">
                {step.step_name}
              </span>

              {/* 状态标签 */}
              <span
                className={`text-[10px] font-medium ${theme.text} leading-none`}
              >
                {theme.label}
              </span>

              {/* 时机提示 */}
              {step.when_hint && (
                <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400 leading-none">
                  <Clock className="w-2 h-2" />
                  {step.when_hint}
                </span>
              )}
            </div>

            {/* 连接线 */}
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