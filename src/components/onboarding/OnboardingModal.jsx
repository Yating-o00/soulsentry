import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { TOUR_STEPS } from "./tourSteps";

export default function OnboardingModal({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = TOUR_STEPS[stepIndex];
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onComplete}
          aria-label="关闭引导"
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 no-min-size"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center mb-4 shadow-lg shadow-[#384877]/20">
          <Icon className="w-7 h-7 text-white" />
        </div>

        <h3 className="font-bold text-xl text-slate-800 mb-2">{step.title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{step.description}</p>

        {step.examples && (
          <div className="flex flex-wrap gap-2 mb-5">
            {step.examples.map((ex) => (
              <span
                key={ex}
                className="text-xs px-3 py-1.5 rounded-full bg-[#384877]/5 text-[#384877] border border-[#384877]/10"
              >
                {ex}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1.5">
            {Array.from({ length: TOUR_STEPS.length }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? "w-5 bg-[#384877]" : "w-1.5 bg-slate-200"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => setStepIndex((i) => i - 1)}
              >
                上一步
              </Button>
            )}
            <Button
              size="sm"
              className="text-xs bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:opacity-90"
              onClick={() => {
                if (stepIndex === TOUR_STEPS.length - 1) {
                  onComplete();
                } else {
                  setStepIndex((i) => i + 1);
                }
              }}
            >
              {stepIndex === TOUR_STEPS.length - 1 ? "开始使用" : "下一步"}
            </Button>
          </div>
        </div>

        {stepIndex === 0 && (
          <button
            onClick={onComplete}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-500 mt-4 no-min-size"
          >
            跳过引导
          </button>
        )}
      </div>
    </div>
  );
}
