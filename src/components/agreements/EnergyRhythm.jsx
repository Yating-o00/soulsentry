import React from "react";

// 能量节律图：你通常在什么时段真正兑现约定
export default function EnergyRhythm({ rhythm = [] }) {
  const max = Math.max(1, ...rhythm.map((b) => b.count));
  const peak = rhythm.reduce((a, b) => (b.count > a.count ? b : a), rhythm[0] || { count: 0 });

  return (
    <div>
      <div className="flex items-end gap-1.5 h-16">
        {rhythm.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t-md bg-[#6B8E23]/70"
              style={{ height: `${Math.max(4, (b.count / max) * 48)}px` }}
              title={`${b.label} ${b.count} 次`}
            />
            <span className="text-[9px] text-slate-400">{b.label}</span>
          </div>
        ))}
      </div>
      {peak?.count > 0 && (
        <p className="text-[11px] text-slate-500 mt-2">你的高能时段在{peak.label}</p>
      )}
    </div>
  );
}