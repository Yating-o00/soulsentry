import React, { useState } from "react";
import { Presentation, Download, ExternalLink, Play } from "lucide-react";
import PptPreviewModal from "./PptPreviewModal";

// PPT/办公文档结果视图：封面块 + 在线预览 + 大纲 + 下载
export default function PptResultView({ data, preview }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [initialSlide, setInitialSlide] = useState(0);
  const fileUrl = data?.file_url;
  const fileName = data?.file_name || "演示文稿.html";
  const title = data?.title || data?.subject || "演示文稿";
  const subtitle = data?.subtitle || "";
  const slides = Array.isArray(data?.slides) ? data.slides : null;
  const outline = Array.isArray(data?.outline) ? data.outline : null;
  const pageCount = slides?.length || outline?.length || data?.page_count || 0;
  // 如果没有 slides 但有 outline，自动转换为可预览的 slides（兼容旧数据）
  const previewSlides = slides && slides.length > 0
    ? slides
    : (outline && outline.length > 0
        ? [{ heading: title }, ...outline.map(o => ({
            heading: typeof o === 'string' ? o : (o.title || o.heading || ''),
            body: typeof o === 'string' ? '' : (o.desc || o.body || '')
          }))]
        : null);
  const previewData = previewSlides ? { ...data, slides: previewSlides } : data;
  const canPreview = !!(previewSlides && previewSlides.length > 0);

  const openAt = (idx) => {
    if (!canPreview) return;
    setInitialSlide(idx);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-2.5">
      {/* 封面（可点击预览）*/}
      <div className="rounded-xl overflow-hidden border border-slate-200 relative group">
        <button
          type="button"
          onClick={() => openAt(0)}
          disabled={!canPreview}
          className="w-full aspect-[16/9] bg-gradient-to-br from-[#1e3a5f] to-[#3b5998] flex flex-col items-center justify-center text-white px-4 relative overflow-hidden disabled:cursor-default"
        >
          <Presentation className="w-6 h-6 mb-2 opacity-80" />
          <div className="text-[15px] font-bold text-center line-clamp-2">{title}</div>
          {subtitle && <div className="text-[11px] opacity-80 mt-1 text-center line-clamp-1">{subtitle}</div>}
          {canPreview && (
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-[#1e3a5f] text-[12px] font-semibold shadow-lg">
                <Play className="w-3.5 h-3.5 fill-current" />
                在线预览
              </div>
            </div>
          )}
        </button>
        {pageCount > 0 && (
          <div className="bg-white px-3 py-1.5 text-[10.5px] text-slate-500 text-center border-t border-slate-100">
            共 {pageCount} 页 {canPreview && "· 点击封面预览"}
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

      {/* 缩略图条（点击跳转到对应页）*/}
      {pageCount > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {Array.from({ length: Math.min(pageCount, 12) }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => openAt(i)}
              disabled={!canPreview}
              title={`预览第 ${i + 1} 页`}
              className="w-12 h-8 rounded bg-gradient-to-br from-[#1e3a5f] to-[#3b5998] flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0 border border-slate-200 hover:scale-110 hover:shadow-md hover:ring-2 hover:ring-[#3b5998]/40 active:scale-95 transition-all disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:ring-0"
            >
              {i + 1}
            </button>
          ))}
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