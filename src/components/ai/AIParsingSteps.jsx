import React from "react";
import { CheckCircle2, Loader2, Clock, Sparkles, MapPin, Link as LinkIcon, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { key: "time", label: "时间提取", icon: Clock },
  { key: "intent", label: "意图识别", icon: Sparkles },
  { key: "space", label: "空间计算", icon: MapPin },
  { key: "device", label: "设备协同", icon: LinkIcon },
  { key: "auto", label: "自动化生成", icon: Zap },
];

export default function AIParsingSteps({ currentStep = 0 }) {
  return (
    <div className="rounded-2xl bg-white/80 border border-slate-100 p-4 md:p-5">
      <div className="flex items-center gap-3 mb-3 text-slate-500">
        <Loader2 className={cn("w-4 h-4", currentStep > 0 ? "animate-spin" : "")} />
        <span className="text-sm">正在分析你的输入...</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {steps.map((s, idx) => {
          const StatusIcon = idx + 1 < currentStep ? CheckCircle2 : s.icon;
          const isDone = idx + 1 < currentStep;
          const isActive = idx + 1 === currentStep;
          return (
            <div
              key={s.key}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2",
                isDone ? "bg-emerald-50/60 border-emerald-100 text-emerald-700" :
                isActive ? "bg-indigo-50/60 border-indigo-100 text-indigo-700" :
                "bg-slate-50/50 border-slate-100 text-slate-600"
              )}
            >
              <StatusIcon className={cn("w-4 h-4 flex-shrink-0", isDone && "text-emerald-600", isActive && "text-indigo-600")} />
              <span className="text-xs font-medium">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}