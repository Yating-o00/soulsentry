import React from "react";
import { Clock } from "lucide-react";

/**
 * AI 智能规划 · 步骤链路
 *
 * 含义：AI 对用户输入（约定/任务/愿望）理解后，推导出的现实世界行动步骤，
 * 不是产品内部的任务状态流转。
 *
 * 统一为纵向编号列表，每步展示：
 *   - 序号
 *   - 动作名称（step_name）
 *   - 时机提示（when_hint，如"本周内"）
 *   - 简短说明（detail）
 */
export default function ExecutionStepFlow({ steps = [] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 group"
          title={step.detail || step.step_name}
        >
          <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-[10px] font-semibold text-indigo-500">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[13px] font-medium text-slate-800 leading-snug">
                {step.step_name}
              </span>
              {step.when_hint && (
                <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                  <Clock className="w-2.5 h-2.5" />
                  {step.when_hint}
                </span>
              )}
            </div>
            {step.detail && (
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
                {step.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}