import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function TourStepCard({ step, index, total, onPrev, onNext, onSkip }) {
  const Icon = step.icon;
  return (
    <div className="bg-white rounded-2xl shadow-2xl p-5 relative">
      <button onClick={onSkip} aria-label="关闭引导" className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 no-min-size">
        <X className="w-4 h-4" />
      </button>
      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center mb-3 shadow-lg shadow-[#384877]/20">
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="font-bold text-lg text-slate-800 mb-1">{step.title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed mb-3">{step.description}</p>
      {step.examples && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {step.examples.map((ex) => (
            <span key={ex} className="text-xs px-2.5 py-1 rounded-full bg-[#384877]/5 text-[#384877] border border-[#384877]/10">
              {ex}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[#384877]" : "w-1.5 bg-slate-200"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {index > 0 && (
            <Button size="sm" variant="ghost" className="text-xs" onClick={onPrev}>上一步</Button>
          )}
          <Button size="sm" className="text-xs bg-gradient-to-r from-[#384877] to-[#3b5aa2]" onClick={onNext}>
            {index === total - 1 ? "开始使用" : "下一步"}
          </Button>
        </div>
      </div>
      {index === 0 && (
        <button onClick={onSkip} className="w-full text-center text-xs text-slate-400 hover:text-slate-500 mt-3 no-min-size">
          跳过引导
        </button>
      )}
    </div>
  );
}