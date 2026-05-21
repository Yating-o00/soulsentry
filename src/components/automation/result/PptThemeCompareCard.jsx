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
export default function PptThemeCompareCard({ activeSlide, currentTheme, onSelect, disabled }) {
  const heading = activeSlide?.heading || "标题预览";
  const subtitle = activeSlide?.subtitle || "";
  const bullets = Array.isArray(activeSlide?.bullets) ? activeSlide.bullets.slice(0, 3) : [];
  const body = activeSlide?.body || "";

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-2.5">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-0.5">
        风格对比 · 点击应用
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
              className={`group relative rounded-lg overflow-hidden border-2 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed ${
                active
                  ? "border-[#384877] shadow-md scale-[1.02]"
                  : "border-slate-200 hover:border-slate-400 hover:shadow"
              }`}
              style={{ containerType: "inline-size" }}
            >
              {/* 迷你封面 */}
              <div
                className="aspect-[16/9] flex flex-col justify-center px-2.5 py-2"
                style={{ background: v.bg, color: v.fg }}
              >
                <div
                  className="font-bold line-clamp-1 mb-0.5"
                  style={{ fontSize: "clamp(8px,3cqw,13px)", lineHeight: 1.2 }}
                >
                  {heading}
                </div>
                {subtitle && (
                  <div
                    className="line-clamp-1 mb-1"
                    style={{ fontSize: "clamp(6px,2cqw,10px)", color: v.muted, lineHeight: 1.3 }}
                  >
                    {subtitle}
                  </div>
                )}
                {bullets.length > 0 ? (
                  <ul className="space-y-0.5">
                    {bullets.map((b, i) => (
                      <li
                        key={i}
                        className="flex gap-1 items-start line-clamp-1"
                        style={{ fontSize: "clamp(6px,1.9cqw,10px)", lineHeight: 1.3 }}
                      >
                        <span
                          className="flex-shrink-0 rounded-sm"
                          style={{
                            width: "clamp(3px,0.9cqw,5px)",
                            height: "clamp(3px,0.9cqw,5px)",
                            background: v.dotGrad,
                            marginTop: "clamp(2px,0.6cqw,4px)",
                            transform: "rotate(45deg)",
                          }}
                        />
                        <span className="truncate" style={{ color: v.muted }}>
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : body ? (
                  <p
                    className="line-clamp-2"
                    style={{ fontSize: "clamp(6px,1.9cqw,10px)", color: v.muted, lineHeight: 1.4 }}
                  >
                    {body}
                  </p>
                ) : null}
              </div>

              {/* 标签条 */}
              <div className="flex items-center justify-between px-1.5 py-1 bg-white border-t border-slate-100">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10.5px] font-semibold text-slate-800 truncate">{v.label}</span>
                  <span className="text-[9px] text-slate-400 truncate">{v.desc}</span>
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