import React from "react";
import { Clock } from "lucide-react";

const fmt = (v) => new Date(v).toLocaleString("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtT = (v) => new Date(v).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function PlanStepList({ steps }) {
  return (
    <ol className="space-y-1.5 max-h-72 overflow-auto pr-1">
      {steps.map((s, i) => (
        <li key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-1.5 text-[11px] text-[#384877]">
            <Clock className="w-3 h-3" />
            {fmt(s.start_time)}{!isNaN(new Date(s.end_time)) && ` – ${fmtT(s.end_time)}`}
          </div>
          <p className="text-sm font-medium text-slate-800 mt-0.5">{s.title}</p>
          {s.detail && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{s.detail}</p>}
        </li>
      ))}
    </ol>
  );
}