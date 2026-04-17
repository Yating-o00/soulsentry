import React from "react";
import { Check, Loader2, Circle, AlertCircle } from "lucide-react";

const statusConfig = {
  completed: { icon: Check, color: "text-emerald-500 bg-emerald-50 border-emerald-200" },
  running: { icon: Loader2, color: "text-indigo-500 bg-indigo-50 border-indigo-200", spin: true },
  failed: { icon: AlertCircle, color: "text-red-500 bg-red-50 border-red-200" },
  pending: { icon: Circle, color: "text-slate-300 bg-slate-50 border-slate-200" },
};

export default function ExecutionStepFlow({ steps = [] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {steps.map((step, i) => {
        const cfg = statusConfig[step.status] || statusConfig.pending;
        const Icon = cfg.icon;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className={`w-6 h-px flex-shrink-0 ${
                step.status === "completed" || step.status === "running" 
                  ? "bg-indigo-300" 
                  : "bg-slate-200"
              }`} />
            )}
            <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[56px]" title={step.detail || step.step_name}>
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${cfg.color}`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.spin ? "animate-spin" : ""}`} />
              </div>
              <span className="text-[10px] text-slate-500 text-center leading-tight max-w-[60px] truncate">
                {step.step_name}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}