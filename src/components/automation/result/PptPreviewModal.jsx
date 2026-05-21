import React, { useEffect, useState, useRef } from "react";
import { X, ExternalLink, Loader2 } from "lucide-react";

// 全屏预览：直接 iframe 渲染后端生成的 HTML 演示稿
// —— 这样所有 layout 模板（cover/agenda/stats/timeline/cards/comparison 等）都能正确显示，
//    前端无需再实现一份模板代码，且和"下载/打开"看到的一致。
export default function PptPreviewModal({ open, onClose, data, fileUrl, fileName }) {
  const fileUrlRef = data?.file_url || fileUrl;
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const iframeRef = useRef(null);

  // 拉取 HTML 内容，转 blob:// 以绕过对象存储的 attachment 头，强制内联渲染
  useEffect(() => {
    if (!open || !fileUrlRef) return;
    let cancelled = false;
    let createdUrl = null;
    setLoading(true);
    setErr(null);
    fetch(fileUrlRef)
      .then(r => r.blob())
      .then(b => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(new Blob([b], { type: "text/html; charset=utf-8" }));
        setBlobUrl(createdUrl);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setErr(e.message || "加载失败");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, fileUrlRef]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 text-white flex-shrink-0">
        <div className="text-[13px] font-medium truncate">{fileName || data?.title || "演示文稿"}</div>
        <div className="flex items-center gap-1">
          {fileUrlRef && (
            <a
              href={fileUrlRef}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg hover:bg-white/15 text-xs flex items-center gap-1.5"
              title="在新标签页打开"
            >
              <ExternalLink className="w-3.5 h-3.5" /> 新标签打开
            </a>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/15" title="关闭 (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iframe 直接渲染后端 HTML —— 所有 layout 模板都能正确显示 */}
      <div className="flex-1 relative bg-black">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载演示稿…
          </div>
        )}
        {err && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-3 text-sm">
            <div>预览加载失败：{err}</div>
            {fileUrlRef && (
              <a href={fileUrlRef} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> 在新标签页打开
              </a>
            )}
          </div>
        )}
        {blobUrl && !err && (
          <iframe
            ref={iframeRef}
            src={blobUrl}
            title="ppt-preview"
            className="w-full h-full border-0 bg-white"
            sandbox="allow-same-origin allow-scripts"
          />
        )}
      </div>
    </div>
  );
}