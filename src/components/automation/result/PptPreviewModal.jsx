import React, { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink, Maximize2 } from "lucide-react";

// 直接用 slides 数据在浏览器内渲染 PPT 预览，不依赖远程文件
const THEMES = {
  business: { bg: "#0f172a", fg: "#f8fafc", accent: "#3b82f6", muted: "#94a3b8" },
  minimal:  { bg: "#ffffff", fg: "#0f172a", accent: "#384877", muted: "#64748b" },
  tech:     { bg: "#020617", fg: "#e2e8f0", accent: "#22d3ee", muted: "#64748b" },
};

export default function PptPreviewModal({ open, onClose, data, fileUrl, fileName, initialSlide = 0 }) {
  const slides = Array.isArray(data?.slides) ? data.slides : [];
  const theme = THEMES[data?.theme] || THEMES.minimal;
  const title = data?.title || "演示文稿";
  const subtitle = data?.subtitle || "";
  const [cur, setCur] = useState(0);

  const go = useCallback((d) => {
    setCur((c) => Math.max(0, Math.min(slides.length - 1, c + d)));
  }, [slides.length]);

  // 打开时 / initialSlide 变化时同步当前页码
  useEffect(() => {
    if (!open) return;
    setCur(Math.max(0, Math.min(slides.length - 1, initialSlide || 0)));
  }, [open, initialSlide, slides.length]);

  // 键盘控制
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (["ArrowRight", "PageDown", " "].includes(e.key)) go(1);
      else if (["ArrowLeft", "PageUp"].includes(e.key)) go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, go]);

  if (!open) return null;

  const slide = slides[cur] || {};
  const isCover = cur === 0 && !(slide.bullets?.length) && !slide.body;
  const heading = slide.heading || "";
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  const body = slide.body || "";

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/50 text-white">
        <div className="text-[13px] font-medium truncate">{fileName || title}</div>
        <div className="flex items-center gap-1">
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-white/15" title="在新标签页打开">
              <Maximize2 className="w-4 h-4" />
            </a>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/15" title="关闭 (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 幻灯片 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className="w-full max-w-5xl aspect-[16/9] rounded-xl shadow-2xl flex flex-col justify-center px-[8%] py-[6%] relative overflow-hidden"
          style={{ background: theme.bg, color: theme.fg }}
        >
          <div className="absolute top-4 right-5 text-xs tracking-widest" style={{ color: theme.muted }}>
            {cur + 1} / {slides.length}
          </div>
          {isCover ? (
            <div className="text-center">
              <h1
                className="text-3xl md:text-5xl font-extrabold leading-tight mb-3"
                style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.fg})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
              >
                {heading || title}
              </h1>
              {(subtitle || slide.subtitle) && (
                <p className="text-sm md:text-lg" style={{ color: theme.muted }}>{subtitle || slide.subtitle}</p>
              )}
              <div
                className="inline-block mt-6 px-4 py-1 rounded-full text-xs tracking-widest"
                style={{ border: `1px solid ${theme.muted}40`, color: theme.muted }}
              >
                {slides.length} 页 · 心栈 SoulSentry
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-2xl md:text-4xl font-bold mb-4 leading-tight" style={{ color: theme.accent }}>
                {heading}
              </h2>
              {bullets.length > 0 && (
                <ul className="space-y-2 text-base md:text-xl leading-relaxed">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="mt-2 w-2 h-2 rounded-full flex-shrink-0" style={{ background: theme.accent }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {body && (
                <p className="mt-4 text-sm md:text-lg leading-relaxed whitespace-pre-wrap" style={{ color: theme.muted }}>
                  {body}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 底部控制条 */}
      <div className="flex items-center justify-center gap-3 pb-5 pt-2 text-white">
        <button onClick={() => go(-1)} disabled={cur === 0} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-sm text-white/70 min-w-[80px] text-center tabular-nums">
          {cur + 1} / {slides.length}
        </div>
        <button onClick={() => go(1)} disabled={cur >= slides.length - 1} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight className="w-5 h-5" />
        </button>
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-3 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" /> 全屏模式
          </a>
        )}
      </div>
    </div>
  );
}