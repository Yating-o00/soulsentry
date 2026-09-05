import React from "react";

/**
 * 今日页面的分组容器：统一的小标签 + 节奏留白，让各板块归属清晰、视觉统一。
 */
export default function SectionGroup({ label, hint, children, className = "" }) {
  return (
    <section className={`space-y-3 md:space-y-4 ${className}`}>
      <div className="flex items-center gap-3 px-0.5">
        <span className="text-[11px] md:text-xs font-semibold tracking-[0.18em] uppercase text-slate-400">
          {label}
        </span>
        {hint && <span className="text-[11px] md:text-xs text-slate-400/80 truncate">{hint}</span>}
        <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
      </div>
      <div className="space-y-4 md:space-y-5">{children}</div>
    </section>
  );
}