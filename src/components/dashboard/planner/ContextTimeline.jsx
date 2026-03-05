import React from "react";
import { Calendar as CalendarIcon, PenLine, Clock, Coffee, User } from "lucide-react";
import { cn } from "@/lib/utils";

const typeConfig = {
  meeting: { icon: CalendarIcon, color: "bg-blue-100 text-blue-600 border-blue-200", accent: "border-l-blue-500", label: "会议" },
  focus:   { icon: PenLine,      color: "bg-amber-100 text-amber-600 border-amber-200", accent: "border-l-amber-500", label: "重点" },
  break:   { icon: Coffee,       color: "bg-emerald-100 text-emerald-600 border-emerald-200", accent: "border-l-emerald-500", label: "休息" },
  personal:{ icon: User,         color: "bg-violet-100 text-violet-600 border-violet-200", accent: "border-l-violet-500", label: "个人" },
  default: { icon: Clock,        color: "bg-slate-100 text-slate-500 border-slate-200", accent: "border-l-slate-400", label: "普通" },
};

const getConfig = (type) => {
  if (typeConfig[type]) return typeConfig[type];
  return typeConfig.default;
};

const formatTime = (raw) => {
  if (!raw) return '';
  // Handle ISO strings like "2026-03-06T09:00:00"
  if (raw.includes('T')) {
    const d = new Date(raw);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return raw;
};

export default function ContextTimeline({ blocks = [] }) {
  const list = (blocks || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  if (list.length === 0) return null;

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 md:p-6 shadow-sm">
      <h4 className="text-base font-bold text-slate-800 mb-4">情境感知时间线</h4>
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[23px] top-4 bottom-4 w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />

        <div className="space-y-1">
          {list.map((b, i) => {
            const cfg = getConfig(b.type);
            const Icon = cfg.icon;
            const time = formatTime(b.time);
            return (
              <div key={i} className="flex items-stretch gap-3 group relative">
                {/* Timeline dot column */}
                <div className="flex flex-col items-center pt-4 z-10 w-[46px] shrink-0">
                  <div className={cn(
                    "w-[10px] h-[10px] rounded-full border-2 bg-white transition-all",
                    cfg.color.split(' ')[1], // text color for border
                    "border-current"
                  )} />
                </div>

                {/* Card */}
                <div className={cn(
                  "flex-1 rounded-2xl border border-slate-100 bg-white p-3.5 transition-all",
                  "hover:shadow-md hover:border-slate-200",
                  "border-l-[3px]",
                  cfg.accent
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
                        cfg.color
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm text-slate-800 truncate">{b.title}</span>
                        </div>
                        {b.description && (
                          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{b.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {time && (
                        <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-lg">
                          {time}
                        </span>
                      )}
                      <span className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                        cfg.color
                      )}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}