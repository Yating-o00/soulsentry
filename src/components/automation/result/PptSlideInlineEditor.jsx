import React from "react";
import { Plus, Trash2, LayoutTemplate } from "lucide-react";

// 13 种版式模板（与后端 renderPptHtml 的 enum 一一对应）
const LAYOUT_OPTIONS = [
  { value: "",                label: "🤖 自动" },
  { value: "cover",           label: "🎬 封面" },
  { value: "agenda",          label: "📋 目录" },
  { value: "section-divider", label: "🔖 章节分隔" },
  { value: "two-column",      label: "📑 双栏文字" },
  { value: "image-left",      label: "🖼️ 左图右文" },
  { value: "image-right",     label: "🖼️ 右图左文" },
  { value: "image-full",      label: "🌄 整页大图" },
  { value: "quote",           label: "💬 金句引言" },
  { value: "stats",           label: "📊 数据大字" },
  { value: "cards",           label: "🃏 卡片网格" },
  { value: "timeline",        label: "⏳ 时间线" },
  { value: "comparison",      label: "⚖️ 对比" },
  { value: "closing",         label: "🙏 致谢结束" },
];

// 简单的当前页内联编辑器：标题 / 副标题（仅封面）/ 要点列表 / 正文 + layout 选择
// 通过 onChange 抛出更新后的 slide 对象（不直接 mutate 外部数据）
export default function PptSlideInlineEditor({ slide, isCover, fontScale, onChange }) {
  const headingSize = fontScale === "sm" ? "text-[13px]" : fontScale === "lg" ? "text-[20px]" : "text-[16px]";
  const bodySize = fontScale === "sm" ? "text-[11px]" : fontScale === "lg" ? "text-[14px]" : "text-[12.5px]";

  const update = (patch) => onChange({ ...slide, ...patch });

  const updateBullet = (i, val) => {
    const next = [...(slide.bullets || [])];
    next[i] = val;
    update({ bullets: next });
  };
  const removeBullet = (i) => {
    const next = [...(slide.bullets || [])];
    next.splice(i, 1);
    update({ bullets: next });
  };
  const addBullet = () => {
    const next = [...(slide.bullets || []), "新要点"];
    update({ bullets: next });
  };

  const inputCls = "w-full bg-white/10 hover:bg-white/15 focus:bg-white/20 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-white/40 transition";

  return (
    <div className="w-full max-w-full text-white">
      {/* 版式选择条：决定本页用哪个模板渲染 */}
      <div className="flex items-center gap-1.5 mb-2 bg-white/10 rounded-md px-1.5 py-1">
        <LayoutTemplate className="w-3 h-3 text-white/70 flex-shrink-0" />
        <span className="text-[10px] text-white/70 flex-shrink-0">版式</span>
        <select
          value={slide.layout || ""}
          onChange={(e) => update({ layout: e.target.value || undefined })}
          className="flex-1 min-w-0 bg-white/15 hover:bg-white/25 focus:bg-white/30 rounded px-1.5 py-0.5 text-[11px] outline-none cursor-pointer"
          style={{ color: "white" }}
        >
          {LAYOUT_OPTIONS.map((opt) => (
            <option key={opt.value || "_auto"} value={opt.value} style={{ color: "#0f172a", background: "white" }}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={slide.heading || ""}
        onChange={(e) => update({ heading: e.target.value })}
        placeholder="标题"
        className={`${inputCls} ${headingSize} font-bold mb-2`}
      />
      {isCover && (
        <input
          type="text"
          value={slide.subtitle || ""}
          onChange={(e) => update({ subtitle: e.target.value })}
          placeholder="副标题"
          className={`${inputCls} ${bodySize} opacity-90 mb-2`}
        />
      )}

      {!isCover && (
        <>
          <ul className={`space-y-1 ${bodySize}`}>
            {(slide.bullets || []).map((b, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-2 w-1 h-1 rounded-full bg-white/80 flex-shrink-0" />
                <input
                  type="text"
                  value={b}
                  onChange={(e) => updateBullet(i, e.target.value)}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => removeBullet(i)}
                  className="flex-shrink-0 p-1 rounded hover:bg-red-500/30 transition"
                  title="删除该要点"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addBullet}
            className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 transition"
          >
            <Plus className="w-3 h-3" /> 添加要点
          </button>

          <textarea
            value={slide.body || ""}
            onChange={(e) => update({ body: e.target.value })}
            placeholder="正文（可选）"
            rows={3}
            className={`${inputCls} ${bodySize} mt-2 resize-none`}
          />

          {Array.isArray(slide.images) && slide.images.length > 0 && (
            <div className={`mt-2 grid gap-1.5 ${slide.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {slide.images.map((im, i) => (
                <figure key={i} className="bg-white/10 rounded-md overflow-hidden border border-white/20">
                  <img src={im.url} alt={im.caption || ''} className="w-full h-24 object-cover" loading="lazy" />
                  {im.caption && (
                    <figcaption className="text-[10px] text-white/80 px-1.5 py-0.5 truncate">{im.caption}</figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}