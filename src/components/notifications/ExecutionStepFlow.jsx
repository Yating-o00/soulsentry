import React from "react";
import { Check, Loader2, Circle, AlertCircle, ArrowRight } from "lucide-react";

const statusConfig = {
  completed: { icon: Check, color: "text-emerald-500 bg-emerald-50 border-emerald-300" },
  running: { icon: Loader2, color: "text-indigo-500 bg-indigo-50 border-indigo-300", spin: true },
  failed: { icon: AlertCircle, color: "text-red-500 bg-red-50 border-red-300" },
  pending: { icon: Circle, color: "text-slate-300 bg-slate-50 border-slate-200" },
};

export default function ExecutionStepFlow({ steps = [] }) {
  if (!steps || steps.length === 0) return null;

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