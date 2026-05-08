import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// 把 Date 转成 datetime-local input 需要的字符串
const toLocalInput = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const PRESETS = [
  { label: "10 分钟后", minutes: 10 },
  { label: "30 分钟后", minutes: 30 },
  { label: "1 小时后", minutes: 60 },
  { label: "今晚 20:00", custom: "tonight" },
  { label: "明天此时", minutes: 60 * 24 },
  { label: "下周此时", minutes: 60 * 24 * 7 },
];

/**
 * 推迟时间选择器
 * @param {React.ReactNode} children 触发元素
 * @param {(newTimeISO: string) => void} onSnooze 选定后回调，传入 ISO 字符串
 */
export default function SnoozePopover({ children, onSnooze }) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return toLocalInput(d);
  });

  const applyPreset = (preset) => {
    const now = new Date();
    let target;
    if (preset.custom === "tonight") {
      target = new Date();
      target.setHours(20, 0, 0, 0);
      // 已经过了 20:00 → 明晚 20:00
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else {
      target = new Date(now.getTime() + preset.minutes * 60 * 1000);
    }
    onSnooze && onSnooze(target.toISOString());
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customValue) return;
    const target = new Date(customValue);
    if (isNaN(target.getTime())) return;
    onSnooze && onSnooze(target.toISOString());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-3 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2 px-1">
          <Sparkles className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-xs font-semibold text-stone-700">推迟到</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                "text-xs text-stone-700 bg-stone-50 hover:bg-stone-100",
                "border border-stone-100 hover:border-stone-200",
                "px-2.5 py-2 rounded-lg transition-colors text-left"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="border-t border-stone-100 pt-2.5">
          <div className="flex items-center gap-1.5 mb-1.5 px-1">
            <Clock className="w-3 h-3 text-stone-400" />
            <span className="text-[11px] text-stone-500">自定义时间</span>
          </div>
          <div className="flex gap-1.5">
            <input
              type="datetime-local"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
            />
            <button
              type="button"
              onClick={applyCustom}
              className="text-xs font-medium text-white bg-stone-700 hover:bg-stone-900 px-3 py-1.5 rounded-lg transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}