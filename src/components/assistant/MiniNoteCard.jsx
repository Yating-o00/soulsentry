import React from "react";
import { StickyNote, Sparkles, Pin } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

const colorMap = {
  white: "bg-white border-slate-200",
  red: "bg-red-50 border-red-200",
  orange: "bg-orange-50 border-orange-200",
  yellow: "bg-yellow-50 border-yellow-200",
  green: "bg-green-50 border-green-200",
  teal: "bg-teal-50 border-teal-200",
  blue: "bg-blue-50 border-blue-200",
  darkblue: "bg-indigo-50 border-indigo-200",
  purple: "bg-purple-50 border-purple-200",
  pink: "bg-pink-50 border-pink-200",
  brown: "bg-amber-50 border-amber-200",
  gray: "bg-slate-50 border-slate-200",
};

export default function MiniNoteCard({ note, isHighlight }) {
  const colorClass = colorMap[note.color] || colorMap.white;
  const preview = (note.plain_text || (note.content || "").replace(/<[^>]+>/g, "")).trim();
  const firstLine = preview.split("\n")[0]?.slice(0, 60) || "（空白心签）";
  const created = note.created_date ? new Date(note.created_date) : null;

  return (
    <div className={`
      group relative overflow-hidden rounded-xl border p-2.5 transition-all
      ${colorClass}
      ${isHighlight ? "ring-2 ring-blue-200/60 shadow-md" : "hover:shadow-sm"}
    `}>
      {isHighlight && (
        <Sparkles className="absolute top-1 right-1 w-3 h-3 text-blue-500" />
      )}

      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-5 h-5 rounded-md bg-white/70 border border-white flex items-center justify-center">
          <StickyNote className="w-3 h-3 text-slate-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs font-semibold text-slate-800 truncate">
              {firstLine}
            </p>
            {note.is_pinned && <Pin className="w-3 h-3 text-amber-500 flex-shrink-0" />}
          </div>

          {preview.length > 60 && (
            <p className="text-[10px] text-slate-500 line-clamp-2 mb-1">
              {preview.slice(60, 180)}...
            </p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {created && (
              <span className="text-[10px] text-slate-500">
                {format(created, "MM-dd HH:mm", { locale: zhCN })}
              </span>
            )}
            {Array.isArray(note.tags) && note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 text-slate-600 border border-white"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}