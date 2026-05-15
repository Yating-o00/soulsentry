import React from "react";
import { StickyNote, Tag } from "lucide-react";

// 笔记/心签类结果视图：标题 + 富文本风格内容 + 标签
export default function NoteResultView({ data, preview }) {
  const title = data?.title || "整理结果";
  const content = data?.content || data?.body || preview || "";
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const keyPoints = Array.isArray(data?.key_points) ? data.key_points : [];

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200 p-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <StickyNote className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">心签</span>
        </div>
        <div className="text-[14px] font-bold text-slate-800 leading-snug mb-2">{title}</div>

        {keyPoints.length > 0 && (
          <ul className="space-y-1 mb-2.5">
            {keyPoints.map((p, i) => (
              <li key={i} className="text-[11.5px] text-slate-700 leading-relaxed flex gap-1.5">
                <span className="text-amber-600 flex-shrink-0">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        {content && (
          <div className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {content}
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {tags.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white text-amber-700 border border-amber-200 text-[10.5px] font-medium">
                <Tag className="w-2.5 h-2.5" />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}