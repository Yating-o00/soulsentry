import React, { useState, useEffect } from "react";
import { Presentation, Download, ExternalLink, Play, Pencil, Check, X, Type } from "lucide-react";
import PptPreviewModal from "./PptPreviewModal";
import PptSlideInlineEditor from "./PptSlideInlineEditor";

// PPT/办公文档结果视图：封面块 + 在线预览 + 大纲 + 下载
export default function PptResultView({ data, preview }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [initialSlide, setInitialSlide] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [fontScale, setFontScale] = useState("md"); // sm / md / lg
  const [editedSlides, setEditedSlides] = useState(null); // 用户本地编辑后的 slides
  const fileUrl = data?.file_url;
  const fileName = data?.file_name || "演示文稿.html";
  const title = data?.title || data?.subject || "演示文稿";
  const subtitle = data?.subtitle || "";
  const slides = Array.isArray(data?.slides) ? data.slides : null;
  const outline = Array.isArray(data?.outline) ? data.outline : null;
  const pageCount = slides?.length || outline?.length || data?.page_count || 0;
  // 如果没有 slides 但有 outline，自动转换为可预览的 slides（兼容旧数据）
  const baseSlides = slides && slides.length > 0
    ? slides
    : (outline && outline.length > 0
        ? [{ heading: title }, ...outline.map(o => ({
            heading: typeof o === 'string' ? o : (o.title || o.heading || ''),
            body: typeof o === 'string' ? '' : (o.desc || o.body || '')
          }))]
        : null);
  // 优先使用用户已编辑版本
  const previewSlides = editedSlides || baseSlides;
  const previewData = previewSlides ? { ...data, slides: previewSlides } : data;
  const canPreview = !!(previewSlides && previewSlides.length > 0);

  const openAt = (idx) => {
    if (!canPreview) return;
    setInitialSlide(idx);
    setPreviewOpen(true);
  };
  // 内联切换封面预览（不打开全屏）
  const showAt = (idx) => {
    if (!canPreview) return;
    setActiveIdx(idx);
  };
  const activeSlide = canPreview ? (previewSlides[activeIdx] || previewSlides[0]) : null;
  const activeHeading = activeSlide?.heading || title;
  const activeSubtitle = activeSlide?.subtitle || (activeIdx === 0 ? subtitle : "");
  const activeBullets = Array.isArray(activeSlide?.bullets) ? activeSlide.bullets : [];
  const activeBody = activeSlide?.body || "";
  const isCover = activeIdx === 0;

  // 字号档位映射
  const headingCls = fontScale === "sm" ? "text-[13px]" : fontScale === "lg" ? "text-[20px] md:text-[22px]" : "text-[14px] md:text-[16px]";
  const bodyCls = fontScale === "sm" ? "text-[10.5px]" : fontScale === "lg" ? "text-[13px] md:text-[15px]" : "text-[11.5px] md:text-[12.5px]";

  // 退出编辑模式时若切换页码则保留当前编辑
  const updateActiveSlide = (next) => {
    const base = previewSlides.map((s, i) => (i === activeIdx ? next : s));
    setEditedSlides(base);
  };

  return (
    <div className="space-y-2.5">
      {/* 封面（点击数字会在此处直接切换内容；点击大屏打开全屏；可进入编辑模式）*/}
      <div className="rounded-xl overflow-hidden border border-slate-200 relative group">
        {/* 工具栏 */}
        {canPreview && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            {editing && (
              <div className="flex items-center gap-0.5 bg-white/95 rounded-full px-1 py-0.5 shadow">
                <Type className="w-3 h-3 text-slate-500 ml-1" />
                {["sm", "md", "lg"].map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setFontScale(sz)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold transition ${
                      fontScale === sz ? "bg-[#3b5998] text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {sz === "sm" ? "小" : sz === "lg" ? "大" : "中"}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setEditing(e => !e)}
              className={`p-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1 shadow transition ${
                editing ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-white/95 text-slate-700 hover:bg-white"
              }`}
              title={editing ? "完成编辑" : "编辑当前页"}
            >
              {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* 大屏 */}
        {editing ? (
          <div className="w-full aspect-[16/9] bg-gradient-to-br from-[#1e3a5f] to-[#3b5998] flex flex-col justify-center px-6 py-6 overflow-y-auto">
            {!isCover && (
              <div className="text-[10px] tracking-widest text-white/60 mb-1.5">{activeIdx + 1} / {previewSlides.length}</div>
            )}
            {isCover && <Presentation className="w-5 h-5 text-white/70 mb-2 mx-auto" />}
            <PptSlideInlineEditor
              slide={activeSlide || {}}
              isCover={isCover}
              fontScale={fontScale}
              onChange={updateActiveSlide}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openAt(activeIdx)}
            disabled={!canPreview}
            className="w-full aspect-[16/9] bg-gradient-to-br from-[#1e3a5f] to-[#3b5998] flex flex-col items-center justify-center text-white px-6 py-6 relative overflow-hidden disabled:cursor-default text-left"
          >
            {isCover ? (
              <div className="flex flex-col items-center justify-center w-full">
                <Presentation className="w-6 h-6 mb-2 opacity-80" />
                <div className={`${headingCls} font-bold text-center line-clamp-2`}>{activeHeading}</div>
                {activeSubtitle && <div className={`${bodyCls} opacity-80 mt-1 text-center line-clamp-1`}>{activeSubtitle}</div>}
              </div>
            ) : (
              <div className="w-full max-w-full">
                <div className="text-[10px] tracking-widest opacity-60 mb-1.5">{activeIdx + 1} / {previewSlides.length}</div>
                <div className={`${headingCls} font-bold mb-2 line-clamp-2`}>{activeHeading}</div>
                {activeBullets.length > 0 && (
                  <ul className={`space-y-1 ${bodyCls} opacity-95`}>
                    {activeBullets.slice(0, 5).map((b, i) => (
                      <li key={i} className="flex gap-1.5 items-start">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-white/80 flex-shrink-0" />
                        <span className="line-clamp-2">{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!activeBullets.length && activeBody && (
                  <p className={`${bodyCls} opacity-90 line-clamp-4 whitespace-pre-wrap`}>{activeBody}</p>
                )}
              </div>
            )}
            {canPreview && (
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-[#1e3a5f] text-[12px] font-semibold shadow-lg">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  全屏预览
                </div>
              </div>
            )}
          </button>
        )}

        {pageCount > 0 && (
          <div className="bg-white px-3 py-1.5 text-[10.5px] text-slate-500 text-center border-t border-slate-100">
            {editing
              ? `编辑第 ${activeIdx + 1} / ${pageCount} 页 · 可调字号 · 完成后点 ✓`
              : `共 ${pageCount} 页 · 点击下方数字切换 · 点击封面全屏`}
          </div>
        )}
      </div>

      {/* 预览弹层（内置渲染，不依赖远程文件）*/}
      <PptPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        data={previewData}
        fileUrl={fileUrl}
        fileName={fileName}
        initialSlide={initialSlide}
      />

      {/* 缩略图条（单击切换上方封面，双击打开全屏）*/}
      {pageCount > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {Array.from({ length: Math.min(pageCount, 12) }).map((_, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={i}
                type="button"
                onClick={() => showAt(i)}
                onDoubleClick={() => openAt(i)}
                disabled={!canPreview}
                title={`第 ${i + 1} 页（双击全屏）`}
                className={`w-12 h-8 rounded flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0 border transition-all active:scale-95 ${
                  isActive
                    ? "bg-gradient-to-br from-[#3b5998] to-[#5b7fc7] ring-2 ring-[#3b5998] border-white shadow-md scale-105"
                    : "bg-gradient-to-br from-[#1e3a5f] to-[#3b5998] border-slate-200 hover:scale-110 hover:shadow-md hover:ring-2 hover:ring-[#3b5998]/40"
                } disabled:cursor-default`}
              >
                {i + 1}
              </button>
            );
          })}
          {pageCount > 12 && (
            <button
              type="button"
              onClick={() => openAt(12)}
              disabled={!canPreview}
              className="w-12 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-semibold flex-shrink-0 hover:bg-slate-200 transition-colors"
            >
              +{pageCount - 12}
            </button>
          )}
        </div>
      )}

      {/* 大纲 */}
      {outline && outline.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">PPT 结构</div>
          <div className="space-y-1.5">
            {outline.slice(0, 8).map((o, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded bg-[#384877]/8 text-[#384877] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-slate-800 truncate">{o.title || o}</div>
                  {o.desc && <div className="text-[10.5px] text-slate-500 truncate">{o.desc}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 兜底文本 */}
      {!outline && !slides && preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-40 overflow-y-auto">
          <pre className="text-[11.5px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
        </div>
      )}

      {/* 下载 */}
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 hover:border-violet-400 hover:shadow px-3 py-2.5 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-white border border-violet-200 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Presentation className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-violet-900 truncate">{fileName}</div>
            <div className="text-[10.5px] text-violet-700 flex items-center gap-1">
              <Download className="w-2.5 h-2.5" /> 点击在新标签页打开 / 下载
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
        </a>
      )}
    </div>
  );
}