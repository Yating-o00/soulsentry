import React from "react";
import { Sparkles, MapPin, Zap } from "lucide-react";

export default function ProcessingSteps() {
  const items = [
    { icon: Sparkles, text: "识别意图与优先级..." },
    { icon: MapPin, text: "空间计算与交通分析..." },
    { icon: Zap, text: "生成设备协同策略..." },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_6px_20px_rgba(160,166,232,0.15)] p-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-300 thinking-dot" />
          <span className="h-2 w-2 rounded-full bg-slate-300 thinking-dot" />
          <span className="h-2 w-2 rounded-full bg-slate-300 thinking-dot" />
        </span>
        心栈正在理解语境...
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 text-slate-600">
            <div className="w-8 h-8 rounded-xl bg-[#eef2ff] text-[#7c84cf] flex items-center justify-center">
              <it.icon className="w-4 h-4" />
            </div>
            <span className="text-sm">{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}