import React from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

export const CAPTURE_STEPS = ["时间与意图", "事项链路", "记忆画像", "预执行"];

// 四步解析逐步点亮：current = 正在进行的步骤序号（1..4），0 表示未开始
export default function CaptureSteps({ current = 0 }) {
  if (!current) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      {CAPTURE_STEPS.map((label, idx) => {
        const step = idx + 1;
        const done = current > step;
        const active = current === step;
        return (
          <div
            key={label}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all duration-500",
              done
                ? "bg-[#6B8E23]/10 text-[#4d6619] border-[#6B8E23]/30"
                : active
                ? "bg-[#384877] text-white border-[#384877] shadow-sm"
                : "bg-white text-slate-400 border-slate-200"
            )}
          >
            {done ? (
              <Check className="w-3 h-3" />
            ) : active ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <span className="w-3 text-center text-[10px]">{step}</span>
            )}
            {label}
          </div>
        );
      })}
    </div>
  );
}