import React from "react";
import { Pin } from "lucide-react";
import { TYPE_META, TYPE_ORDER, getNoteType, isPinnedNote } from "./heartSignMeta";

// 心签六类过滤（与小程序 pages/notes 口径一致）；回应浓度选择已移至页面按钮组
export default function CategoryFilterBar({ notes, filter, onFilterChange }) {
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
    </div>
  );
}
