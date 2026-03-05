import React from "react";
import { cn } from "@/lib/utils";

const typeEmoji = {
  meeting:  "📋",
  focus:    "✏️",
  break:    "☕",
  personal: "🌙",
  sleep:    "🌙",
  wake:     "🌅",
  travel:   "🚗",
  navigate: "🅿️",
  reminder: "⏰",
  default:  "🕐",
};

const typeLabel = {
  meeting: "会议",
  focus: "重点",
  break: "休息",
  personal: "个人",
  sleep: "睡前",
  wake: "唤醒",
  travel: "出行",
  navigate: "导航",
  reminder: "提醒",
};

const getEmoji = (type) => typeEmoji[type] || typeEmoji.default;
const getLabel = (type) => typeLabel[type] || null;

const formatTime = (raw) => {
  if (!raw) return '';
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
    <div className="rounded-3xl border border-slate-100 bg-white p-5 md:p-7 shadow-sm">
      <div className="mb-5">
        <h4 className="text-lg font-bold text-[#2c3e50]">情境感知时间线</h4>
        <p className="text-sm text-slate-400 mt-0.5">流动的日程，而非固定的闹钟</p>
      </div>

      <div className="relative ml-1">
        {/* Vertical connector line */}
        <div className="absolute left-[22px] top-6 bottom-6 w-[2px] rounded-full bg-gradient-to-b from-slate-200 via-slate-200/60 to-transparent" />

        <div className="space-y-6">
          {list.map((b, i) => {
            const emoji = getEmoji(b.type);
            const time = formatTime(b.time);
            const label = getLabel(b.type);
            return (
              <div key={i} className="flex gap-4 group relative">
                {/* Emoji icon on the timeline */}
                <div className="flex flex-col items-center z-10 shrink-0 w-[44px]">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-white to-slate-50 border border-slate-100 shadow-sm flex items-center justify-center text-xl">
                    {emoji}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-2.5 mb-1">
                    {time && (
                      <span className="text-sm font-mono font-semibold text-[#384877]">
                        {time}
                      </span>
                    )}
                    <span className="text-base font-bold text-[#2c3e50]">{b.title}</span>
                    {label && (
                      <span className="text-[10px] font-medium text-[#384877]/70 bg-[#384877]/8 px-2 py-0.5 rounded-full border border-[#384877]/10">
                        {label}
                      </span>
                    )}
                  </div>
                  {b.description && (
                    <p className="text-sm text-slate-500 leading-relaxed">{b.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}