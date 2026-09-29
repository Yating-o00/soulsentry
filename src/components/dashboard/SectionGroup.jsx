import React from "react";

/**
 * 今日页面的分组容器：编号 + 标题 + 副标题，统一节奏留白。
 */
export default function SectionGroup({ index, label, hint, children, className = "" }) {
  return (
    <section className={`space-y-3 md:space-y-4 ${className}`}>
      <div className="flex items-baseline gap-2 md:gap-3 px-0.5 min-w-0">
        {index && <span className="text-[11px] md:text-xs font-semibold tabular-nums text-slate-300">{index} /</span>}
        <span className="text-sm md:text-[15px] font-semibold text-slate-700 shrink-0">{label}</span>
        {hint && <span className="text-[11px] md:text-xs text-slate-400 truncate">{hint}</span>}
        <div className="h-px flex-1 self-center bg-gradient-to-r from-slate-200 to-transparent" />
      </div>
      <div className="space-y-4 md:space-y-5">{children}</div>
    </section>
  );
}