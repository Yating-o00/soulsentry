import React, { useState, useEffect, useCallback } from "react";
import { TOUR_STEPS } from "./tourSteps";
import TourStepCard from "./TourStepCard";

// 互动式新手引导：逐步高亮真实界面元素（桌面端），移动端/找不到目标时居中展示
export default function OnboardingTour({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const step = TOUR_STEPS[stepIndex];

  const measure = useCallback(() => {
    if (!step.targetSelector) { setRect(null); return; }
    const el = document.querySelector(step.targetSelector);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) { setRect(null); return; }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const cardStyle = rect
    ? {
        position: "fixed",
        top: Math.min(Math.max(rect.top - 20, 16), window.innerHeight - 360),
        left: Math.min(Math.max(rect.left + rect.width + 20, 16), window.innerWidth - 392),
        zIndex: 102,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 102,
      };

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />
      {rect && (
        <div
          className="fixed rounded-xl ring-4 ring-[#3b5aa2] bg-white/90 pointer-events-none z-[101] transition-all duration-300"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div style={cardStyle} className="w-[min(90vw,360px)] animate-slide-up">
        <TourStepCard
          step={step}
          index={stepIndex}
          total={TOUR_STEPS.length}
          onPrev={() => setStepIndex((i) => Math.max(0, i - 1))}
          onNext={() => (stepIndex === TOUR_STEPS.length - 1 ? onComplete() : setStepIndex((i) => i + 1))}
          onSkip={onComplete}
        />
      </div>
    </div>
  );
}