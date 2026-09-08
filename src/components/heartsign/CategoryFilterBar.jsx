import React from "react";
import { Pin } from "lucide-react";
import { TYPE_META, TYPE_ORDER, DENSITY_OPTIONS, getNoteType, isPinnedNote } from "./heartSignMeta";

// 心签五类过滤 + 回应浓度（与小程序 pages/notes 口径一致）
export default function CategoryFilterBar({ notes, filter, onFilterChange, density, onDensityChange }) {
  const chips = [
    { key: "all", label: "全部" },
    ...TYPE_ORDER.map((t) => ({ key: t, label: `${TYPE_META[t].label}签` })),
    { key: "pinned", label: "已置顶" },
  ];

  const countOf = (key) => {
    if (key === "all") return notes.length;
    if (key === "pinned") return notes.filter(isPinnedNote).length;
    return notes.filter((n) => getNoteType(n) === key).length;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.map((c) => {
          const active = filter === c.key;
          const n = countOf(c.key);
          return (
            <button
              key={c.key}
              onClick={() => onFilterChange(c.key)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors ${
                active
                  ? "bg-[#384877] border-[#384877] text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-[#384877]/40 hover:text-[#384877]"
              }`}
            >
              {c.key === "pinned" && <Pin className="w-3 h-3" />}
              {c.label}
              {n > 0 && <span className={`text-[10px] ${active ? "text-white/70" : "text-slate-400"}`}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 ml-auto text-xs text-slate-500">
        <span className="hidden sm:inline">回应</span>
        <select
          value={density}
          onChange={(e) => onDensityChange(e.target.value)}
          className="bg-white border border-slate-200 rounded-full px-2.5 py-1 text-xs text-slate-600 outline-none focus:border-[#384877]/50"
        >
          {DENSITY_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
