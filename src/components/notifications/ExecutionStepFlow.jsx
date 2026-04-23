import React from "react";
import { Check, Loader2, Circle, AlertCircle, ArrowRight, Clock } from "lucide-react";

const statusConfig = {
  completed: { icon: Check, color: "text-emerald-500 bg-emerald-50 border-emerald-300" },
  running: { icon: Loader2, color: "text-indigo-500 bg-indigo-50 border-indigo-300", spin: true },
  failed: { icon: AlertCircle, color: "text-red-500 bg-red-50 border-red-300" },
  pending: { icon: Circle, color: "text-slate-300 bg-slate-50 border-slate-200" },
  todo: { icon: Circle, color: "text-indigo-400 bg-white border-indigo-200" },
};

export default function ExecutionStepFlow({ steps = [] }) {
  if (!steps || steps.length === 0) return null;

  // 判断是否为「事项链路」模式：全部步骤为 todo 态，即 AI 生成的现实事项链路
  const isRealityChain = steps.length > 0 && steps.every((s) => s.status === "todo" || !!s.when_hint);

  if (isRealityChain) {
    // 事项链路：AI 理解约定后生成的、用户要去完成的现实事项清单
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

  // 产品内流程模式（fallback）：横向步骤条
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto pb-1 scrollbar-hide">
      {steps.map((step, i) => {
        const cfg = statusConfig[step.status] || statusConfig.pending;
        const Icon = cfg.icon;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[60px]" title={step.detail || step.step_name}>
              <div className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all ${cfg.color} ${step.status === "running" ? "shadow-md shadow-indigo-200" : ""}`}>
                <Icon className={`w-4 h-4 ${cfg.spin ? "animate-spin" : ""}`} />
              </div>
              <span className="text-[10px] text-slate-500 text-center leading-tight max-w-[64px] truncate">
                {step.step_name}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center flex-shrink-0 -mt-4">
                <div className={`w-5 h-0.5 ${step.status === "completed" ? "bg-emerald-300" : step.status === "running" ? "bg-indigo-200 animate-pulse" : "bg-slate-200"}`} />
                <ArrowRight className={`w-3 h-3 -mx-0.5 ${step.status === "completed" ? "text-emerald-400" : step.status === "running" ? "text-indigo-400" : "text-slate-300"}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}