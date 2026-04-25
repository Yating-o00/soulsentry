import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Flag, ArrowRight, Hash, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 时间编辑模式：
 * - point: 具体的日期或时间点（reminder_time）
 * - deadline: 截止时间（end_time，无 reminder_time）
 * - start: 起点时间（reminder_time，无 end_time）
 * - range: 时间段（reminder_time + end_time）
 */
const MODES = [
  { key: "point", label: "时间点", icon: Hash, hint: "具体日期/时间" },
  { key: "start", label: "起点", icon: Flag, hint: "开始时间" },
  { key: "deadline", label: "截止", icon: Clock, hint: "截止时间" },
  { key: "range", label: "时间段", icon: ArrowRight, hint: "起止时间" },
];

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const detectMode = (task) => {
  if (task?.reminder_time && task?.end_time) return "range";
  if (!task?.reminder_time && task?.end_time) return "deadline";
  if (task?.reminder_time && !task?.end_time) return "point";
  return "point";
};

export default function MilestoneTimeEditor({ task, onSave, children }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(detectMode(task));
  const [startVal, setStartVal] = useState(toLocalInput(task?.reminder_time));
  const [endVal, setEndVal] = useState(toLocalInput(task?.end_time));

  useEffect(() => {
    if (open) {
      setMode(detectMode(task));
      setStartVal(toLocalInput(task?.reminder_time));
      setEndVal(toLocalInput(task?.end_time));
    }
  }, [open, task]);

  const handleSave = (e) => {
    e?.stopPropagation();
    const startISO = fromLocalInput(startVal);
    const endISO = fromLocalInput(endVal);
    let payload = {};
    if (mode === "point") {
      payload = { reminder_time: startISO, end_time: null };
    } else if (mode === "start") {
      payload = { reminder_time: startISO, end_time: null };
    } else if (mode === "deadline") {
      payload = { reminder_time: null, end_time: endISO };
    } else if (mode === "range") {
      payload = { reminder_time: startISO, end_time: endISO };
    }
    onSave && onSave(payload);
    setOpen(false);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onSave && onSave({ reminder_time: null, end_time: null });
    setOpen(false);
  };

  const showStart = mode === "point" || mode === "start" || mode === "range";
  const showEnd = mode === "deadline" || mode === "range";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        onClick={(e) => e.stopPropagation()}
        align="start"
      >
        <div className="text-xs font-medium text-stone-500 mb-2">编辑时间</div>

        {/* Mode tabs */}
        <div className="grid grid-cols-4 gap-1 mb-3 p-1 bg-stone-100 rounded-lg">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={(e) => { e.stopPropagation(); setMode(m.key); }}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[11px] transition-colors",
                  active ? "bg-white text-[#384877] shadow-sm font-medium" : "text-stone-500 hover:text-stone-700"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-stone-400 mb-2 px-0.5">
          {MODES.find((m) => m.key === mode)?.hint}
        </div>

        <div className="space-y-2">
          {showStart && (
            <div>
              <label className="text-[11px] text-stone-500 mb-1 flex items-center gap-1">
                <Flag className="w-3 h-3" />
                {mode === "point" ? "时间点" : "开始时间"}
              </label>
              <Input
                type="datetime-local"
                value={startVal}
                onChange={(e) => setStartVal(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          )}
          {showEnd && (
            <div>
              <label className="text-[11px] text-stone-500 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                截止时间
              </label>
              <Input
                type="datetime-local"
                value={endVal}
                onChange={(e) => setEndVal(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-stone-100">
          <button
            onClick={handleClear}
            className="text-xs text-stone-400 hover:text-red-500 transition-colors"
          >
            清除时间
          </button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
              取消
            </Button>
            <Button size="sm" className="h-8 text-xs bg-[#384877] hover:bg-[#3b5aa2]" onClick={handleSave}>
              <Check className="w-3 h-3 mr-1" /> 保存
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}