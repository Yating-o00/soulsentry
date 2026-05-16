import React from "react";
import { StickyNote, Tag, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// 把 markdown 文本中的 ![alt](url) 转为图片，其余保留为段落文本
function renderContentWithImages(text) {
  const re = /!\[([^\]]*)\]\((https?:[^\s)]+)\)/g;
  const parts = [];
  let last = 0;
  let m;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<p key={`t-${idx++}`} className="whitespace-pre-wrap">{text.slice(last, m.index)}</p>);
    }
    parts.push(
      <figure key={`img-${idx++}`} className="my-1.5 text-center">
        <img src={m[2]} alt={m[1]} className="max-w-full rounded-lg border border-amber-200 shadow-sm mx-auto" loading="lazy" />
        {m[1] && <figcaption className="text-[10px] text-slate-500 italic mt-0.5">{m[1]}</figcaption>}
      </figure>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<p key={`t-${idx++}`} className="whitespace-pre-wrap">{text.slice(last)}</p>);
  }
  return parts;
}

// 笔记/心签类结果视图：标题、要点、正文、标签均可编辑
export default function NoteResultView({ data, preview, onChange, editable = true }) {
  const title = data?.title || "整理结果";
  const contentKey = data?.content !== undefined ? "content" : (data?.body !== undefined ? "body" : "content");
  const content = data?.[contentKey] || preview || "";
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const keyPoints = Array.isArray(data?.key_points) ? data.key_points : [];

  const update = (patch) => {
    if (!onChange) return;
    onChange({ ...(data || {}), ...patch });
  };

  const updateKeyPoint = (i, v) => update({ key_points: keyPoints.map((p, idx) => idx === i ? v : p) });
  const removeKeyPoint = (i) => update({ key_points: keyPoints.filter((_, idx) => idx !== i) });
  const addKeyPoint = () => update({ key_points: [...keyPoints, ""] });
  const removeTag = (i) => update({ tags: tags.filter((_, idx) => idx !== i) });
  const addTag = (v) => { if (v.trim()) update({ tags: [...tags, v.trim()] }); };

  const canEdit = editable && onChange;

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200 p-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <StickyNote className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">心签</span>
        </div>

        {canEdit ? (
          <Input
            value={title}
            onChange={(e) => update({ title: e.target.value })}
            className="text-[14px] font-bold text-slate-800 mb-2 h-8 bg-white/60 border-amber-200"
          />
        ) : (
          <div className="text-[14px] font-bold text-slate-800 leading-snug mb-2">{title}</div>
        )}

        {(keyPoints.length > 0 || canEdit) && (
          <ul className="space-y-1 mb-2.5">
            {keyPoints.map((p, i) => (
              <li key={i} className="text-[11.5px] text-slate-700 leading-relaxed flex gap-1.5 items-start">
                <span className="text-amber-600 flex-shrink-0 mt-1">•</span>
                {canEdit ? (
                  <>
                    <Input
                      value={p}
                      onChange={(e) => updateKeyPoint(i, e.target.value)}
                      className="flex-1 h-6 text-[11.5px] bg-white/60 border-amber-200"
                    />
                    <button onClick={() => removeKeyPoint(i)} className="text-amber-600 hover:text-red-500 mt-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <span>{p}</span>
                )}
              </li>
            ))}
            {canEdit && (
              <li>
                <button onClick={addKeyPoint} className="text-[11px] text-amber-700 hover:text-amber-900 inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> 添加要点
                </button>
              </li>
            )}
          </ul>
        )}

        {canEdit ? (
          <Textarea
            value={content}
            onChange={(e) => update({ [contentKey]: e.target.value })}
            className="text-[12px] text-slate-700 leading-relaxed min-h-[160px] bg-white/60 border-amber-200 font-sans"
            placeholder="正文..."
          />
        ) : (
          content && (
            <div className="text-[12px] text-slate-700 leading-relaxed max-h-72 overflow-y-auto space-y-1.5">
              {renderContentWithImages(content)}
            </div>
          )
        )}

        {(tags.length > 0 || canEdit) && (
          <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
            {tags.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white text-amber-700 border border-amber-200 text-[10.5px] font-medium">
                <Tag className="w-2.5 h-2.5" />
                {t}
                {canEdit && (
                  <button onClick={() => removeTag(i)} className="ml-0.5 hover:text-red-500">
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            ))}
            {canEdit && (
              <input
                type="text"
                placeholder="+ 标签"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(e.currentTarget.value);
                    e.currentTarget.value = "";
                  }
                }}
                className="px-2 py-0.5 rounded-md bg-white border border-dashed border-amber-300 text-[10.5px] text-amber-700 outline-none focus:border-amber-500 w-20"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}