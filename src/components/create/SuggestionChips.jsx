import React from "react";
import { Check, Loader2 } from "lucide-react";

// 可点选的微调 chip —— 点选即应用，不点即按默认落定（不是表单）
export function Chip({ label, applied, busy, onClick, tone = "default" }) {
  const tones = {
    default: applied
      ? "bg-[#384877] text-white border-[#384877]"
      : "bg-white text-slate-600 border-slate-200 hover:border-[#384877]/40 hover:text-[#384877]",
    memory: applied
      ? "bg-emerald-600 text-white border-emerald-600"
      : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    template: applied
      ? "bg-violet-600 text-white border-violet-600"
      : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || applied}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all disabled:cursor-default ${tones[tone]}`}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : applied ? <Check className="w-3 h-3" /> : null}
      {label}
    </button>
  );
}

export function ChipGroup({ title, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// 时间微调选项：相对当前时刻的语义化时间
export function timeOptions() {
  const now = new Date();
  const at = (dayOffset, hour) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const inHours = (h) => new Date(now.getTime() + h * 3600 * 1000).toISOString();
  return [
    { key: "in1h", label: "1 小时后", value: inHours(1) },
    { key: "tonight", label: "今晚 20:00", value: at(0, 20) },
    { key: "tomorrow", label: "明早 9:00", value: at(1, 9) },
    { key: "weekend", label: "本周六 10:00", value: at((6 - now.getDay() + 7) % 7 || 7, 10) },
  ];
}

export const PRIORITY_OPTIONS = [
  { key: "low", label: "不急" },
  { key: "medium", label: "一般" },
  { key: "high", label: "重要" },
  { key: "urgent", label: "紧急" },
];