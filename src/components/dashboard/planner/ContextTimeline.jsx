import React from "react";
import { Calendar as CalendarIcon, PenLine, Clock } from "lucide-react";

const iconFor = (type) => {
  if (type === 'meeting') return CalendarIcon;
  if (type === 'focus') return PenLine;
  return Clock;
};

export default function ContextTimeline({ blocks = [] }) {
  const list = (blocks || []).slice().sort((a,b) => (a.time||'').localeCompare(b.time||''));
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <h4 className="text-lg font-bold text-slate-800 mb-3">情境感知时间线</h4>
      <div className="space-y-3">
        {list.map((b, i) => {
          const Icon = iconFor(b.type);
          return (
            <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-100">
              <div className="w-12 text-slate-600 font-mono text-sm text-right">{b.time}</div>
              <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-slate-800 font-medium">{b.title}</div>
                {b.description && <div className="text-xs text-slate-500">{b.description}</div>}
              </div>
              <span className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">{b.type === 'focus' ? '重点' : '普通'}</span>
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="text-xs text-slate-400">等待你的输入生成时间线…</div>
        )}
      </div>
    </div>
  );
}