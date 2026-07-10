import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TOUR_STEPS } from "./tourSteps";
import TourStepCard from "./TourStepCard";

const CARD_W = 360;
const EST_H = 330;

// 跨页面聚光灯式引导：自动跳转到步骤所在页面，滚动并高亮对应功能模块
export default function OnboardingTour({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const step = TOUR_STEPS[stepIndex];
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    let cancelled = false;
    setRect(null);
    if (step.path && pathRef.current !== step.path) navigate(step.path);
    if (!step.targetSelector) return;

    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      const el = document.querySelector(step.targetSelector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          }
        }, 500);
      } else if (tries < 15) {
        tries += 1;
        setTimeout(attempt, 300);
      }
    };
    setTimeout(attempt, 150);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  let cardStyle;
  if (rect) {
    let top = rect.top + rect.height + 16;
    if (top + EST_H > window.innerHeight - 16) top = Math.max(16, rect.top - EST_H - 16);
    let left = rect.left + rect.width / 2 - CARD_W / 2;
    left = Math.min(Math.max(left, 16), Math.max(16, window.innerWidth - CARD_W - 16));
    cardStyle = { position: "fixed", top, left, zIndex: 103 };
  } else {
    cardStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 103 };
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {rect ? (
        <div
          className="fixed rounded-2xl ring-4 ring-[#5a7bd6] pointer-events-none z-[101] transition-all duration-300"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />
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