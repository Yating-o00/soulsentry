import React, { useEffect, useState } from "react";
import { Brain, Sparkles, MapPin, Link, Zap } from "lucide-react";

const ICONS = {
  time_extraction: Brain,
  intent: Sparkles,
  spatial: MapPin,
  device: Link,
  automation: Zap,
};

export default function AnalysisSteps({ steps = [], running = false }) {
  const [visibleCount, setVisibleCount] = useState(running ? 0 : steps.length);

  useEffect(() => {
    if (!running) return;
    setVisibleCount(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setVisibleCount((c) => Math.min(c + 1, steps.length));
      if (i < steps.length) timeout = setTimeout(tick, 500);
    };
    let timeout = setTimeout(tick, 400);
    return () => clearTimeout(timeout);
  }, [running, steps]);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 border border-slate-200 bg-white/80">
      <div className="flex items-center gap-2 mb-3 text-slate-500 text-xs">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span>AI 正在分析你的输入…</span>
      </div>
      <div className="space-y-2">
        {steps.slice(0, visibleCount).map((s, idx) => {
          const Icon = ICONS[s.key] || Sparkles;
          return (
            <div key={idx} className="flex items-center gap-3 text-slate-700 animate-slide-up">
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-sm leading-relaxed">{s.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}