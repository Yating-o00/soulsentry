import React from "react";
import { Check } from "lucide-react";

// 三种风格的颜色映射，必须与后端 functions/renderPpt 的 themePalette 保持视觉一致
const THEME_VISUALS = {
  business: {
    label: "商务",
    desc: "深蓝紫渐变",
    bg: "linear-gradient(135deg,#1e3a8a 0%,#3b0764 100%)",
    fg: "#ffffff",
    muted: "rgba(255,255,255,0.78)",
    dotGrad: "linear-gradient(135deg,#60a5fa,#a78bfa)",
  },
  minimal: {
    label: "极简",
    desc: "白底黑字",
    bg: "linear-gradient(135deg,#fafafa 0%,#e5e5e5 100%)",
    fg: "#0a0a0a",
    muted: "rgba(10,10,10,0.65)",
    dotGrad: "linear-gradient(135deg,#0a0a0a,#dc2626)",
  },
  tech: {
    label: "科技",
    desc: "深空青绿",
    bg: "linear-gradient(135deg,#022c43 0%,#0c4a6e 50%,#164e63 100%)",
    fg: "#e2e8f0",
    muted: "rgba(226,232,240,0.78)",
    dotGrad: "linear-gradient(135deg,#22d3ee,#a3e635)",
  },
};

const THEME_ORDER = ["business", "minimal", "tech"];

/**
 * 三栏风格对比卡片：把当前活动页用三种主题并排迷你呈现，
 * 让用户在选定前直观看到差异。点击任意一栏即应用该风格。
 */
export default function PptThemeCompareCard({ currentTheme, onSelect, disabled }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-2.5">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-0.5">
        风格 · 点击应用
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {THEME_ORDER.map((key) => {
          const v = THEME_VISUALS[key];
          const active = key === currentTheme;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect?.(key)}
              className={`group relative rounded-lg overflow-hidden border-2 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed px-2.5 py-2 ${
                active
                  ? "border-[#384877] bg-[#384877]/5 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className={`text-[12px] font-semibold truncate ${active ? "text-[#384877]" : "text-slate-800"}`}>
                    {v.label}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate">{v.desc}</span>
                </div>
                {active && (
                  <div className="w-4 h-4 rounded-full bg-[#384877] flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}