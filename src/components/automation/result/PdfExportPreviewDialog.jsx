import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, ZoomIn, ZoomOut, RotateCcw, FileText, Loader2, Download, ExternalLink, AlertTriangle } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// PDF 导出前的可视化预览 + 微调
// 关键改造:用 fetch 把 HTML 抓到本地 → 用 srcDoc 注入 iframe(绕过 X-Frame-Options / 跨域 print 限制)
// 这样无论 base44 文件域名是否同源、是否设置 frame-deny,iframe 都能正常渲染并触发打印
export default function PdfExportPreviewDialog({ open, onClose, fileUrl, fileName }) {
  const iframeRef = useRef(null);
  const [orientation, setOrientation] = useState("portrait");
  const [margin, setMargin] = useState(14);
  const [zoom, setZoom] = useState(100);
  const [htmlContent, setHtmlContent] = useState(""); // fetch 回来的 HTML 源码
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // 每次打开重置参数
  useEffect(() => {
    if (open) {
      setOrientation("portrait");
      setMargin(14);
      setZoom(100);
      setHtmlContent("");
      setFetchError(null);
      setFetchLoading(true);
    }
  }, [open, fileUrl]);

  // fetch HTML → srcDoc(绕过跨域 + iframe 限制)
  useEffect(() => {
    if (!open || !fileUrl) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    setFetchLoading(true);
    setFetchError(null);

    fetch(fileUrl, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => {
        if (cancelled) return;
        // 在 head 注入 <base> 让相对路径资源仍能正确加载
        const baseTag = `<base href="${fileUrl}">`;
        const injected = /<head[^>]*>/i.test(text)
          ? text.replace(/<head[^>]*>/i, m => `${m}${baseTag}`)
          : `<head>${baseTag}</head>${text}`;
        setHtmlContent(injected);
        setFetchLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setFetchError(e.name === 'AbortError' ? '加载超时' : (e.message || '加载失败'));
        setFetchLoading(false);
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [open, fileUrl, fetchKey]);

  // A4 屏幕预览尺寸(mm 等比换算成 px,1mm ≈ 3.78px)
  const A4 = orientation === "portrait"
    ? { w: 210, h: 297 }
    : { w: 297, h: 210 };
  const previewW = Math.round(A4.w * 3.78 * (zoom / 100));
  const previewH = Math.round(A4.h * 3.78 * (zoom / 100));

  // 在 srcDoc iframe 内注入 @page 规则,然后调它的 window.print() —— 用户在系统打印对话框选"另存为 PDF"
  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe?.contentWindow) {
      // 兜底:新标签打开原 URL + 延时 print
      const win = window.open(fileUrl, "_blank");
      if (win) setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 1800);
      return;
    }
    setPrinting(true);
    try {
      const doc = iframe.contentDocument;
      doc.getElementById("__pdf_export_override__")?.remove();
      const style = doc.createElement("style");
      style.id = "__pdf_export_override__";
      style.textContent = `@media print { @page { size: A4 ${orientation}; margin: ${margin}mm; } }`;
      doc.head.appendChild(style);
      setTimeout(() => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* ignore */ }
        setPrinting(false);
      }, 200);
    } catch {
      setPrinting(false);
      const win = window.open(fileUrl, "_blank");
      if (win) setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 1800);
    }
  };

  // 把 iframe 内容生成 PDF —— 逐元素打包法
  // 核心思想:不再"截整页再切片"(切片必切字),改为遍历顶级块元素,把每个元素单独 render 成 canvas,
  // 当前页装得下就追加,装不下就开新页;元素本身比一页大才硬切(仅限超大图)。
  // 这样断点永远落在元素之间,绝不可能切字。
  const handleSaveAsPdf = async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    setPrinting(true);
    try {
      const doc = iframe.contentDocument;
      const body = doc.body;

      const isPortrait = orientation === "portrait";
      const pdf = new jsPDF({ orientation: isPortrait ? "p" : "l", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;
      const scale = 2;

      // 1) 把元素的"块"打平:从 body 出发,遇到包含图片/表格的容器就下钻,否则当作一个整块
      // 这样长段落不会被拆,但深层卡片里的图片+段落会被识别为独立块
      const blocks = [];
      const flatten = (el) => {
        if (!el || el.nodeType !== 1) return;
        const tag = el.tagName?.toLowerCase();
        if (!tag) return;
        // 隐藏元素跳过
        const cs = doc.defaultView.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        const rect = el.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) return;
        // 叶子级内容(段落/标题/图片/表格/列表项/分隔线)→ 直接收入
        const LEAF = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "img", "table", "hr", "figure", "li", "blockquote", "pre"];
        if (LEAF.includes(tag)) {
          blocks.push(el);
          return;
        }
        // 容器:看子节点是否含有任何"叶子级"内容,有就下钻,没有就把自己作为一个整块
        const hasLeafChild = Array.from(el.children).some((c) => {
          const t = c.tagName?.toLowerCase();
          if (!t) return false;
          if (LEAF.includes(t)) return true;
          // 容器里还有更深的容器,继续看是否含叶子
          return c.querySelector(LEAF.join(","));
        });
        if (hasLeafChild) {
          Array.from(el.children).forEach(flatten);
        } else {
          blocks.push(el);
        }
      };
      Array.from(body.children).forEach(flatten);

      if (blocks.length === 0) {
        // 兜底:整 body 一张图
        const canvas = await html2canvas(body, { scale, useCORS: true, allowTaint: true, backgroundColor: "#ffffff" });
        const imgH = (canvas.height * contentW) / canvas.width;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, contentW, imgH);
      } else {
        let usedMm = 0; // 当前页已用高度(mm)
        let pageIdx = 0;

        for (let i = 0; i < blocks.length; i++) {
          const el = blocks[i];
          // 截单个元素
          const c = await html2canvas(el, {
            scale,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            windowWidth: body.scrollWidth,
          });
          const blockMmH = (c.height * contentW) / c.width;

          // 当前页放不下 → 新页
          if (usedMm > 0 && usedMm + blockMmH > contentH) {
            pdf.addPage();
            pageIdx += 1;
            usedMm = 0;
          }

          // 元素本身就 > 整页(超大图/超长表):必须切块装多页,但只发生在不可拆元素上
          if (blockMmH > contentH) {
            // 把这张大 canvas 按 contentH 切片(只对超大单元素,无文字断字风险因为是图/表)
            const sliceMaxPx = Math.floor((contentH * c.width) / contentW);
            let yPx = 0;
            while (yPx < c.height) {
              if (usedMm > 0) {
                pdf.addPage();
                pageIdx += 1;
                usedMm = 0;
              }
              const sliceH = Math.min(sliceMaxPx, c.height - yPx);
              const tmp = document.createElement("canvas");
              tmp.width = c.width;
              tmp.height = sliceH;
              const ctx = tmp.getContext("2d");
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, c.width, sliceH);
              ctx.drawImage(c, 0, yPx, c.width, sliceH, 0, 0, c.width, sliceH);
              const sliceMmH = (sliceH * contentW) / c.width;
              pdf.addImage(tmp.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin + usedMm, contentW, sliceMmH);
              usedMm += sliceMmH;
              yPx += sliceH;
            }
          } else {
            // 正常元素:贴到当前 y 位置
            pdf.addImage(c.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin + usedMm, contentW, blockMmH);
            usedMm += blockMmH;
          }
        }
        // pageIdx 仅作引用,实际页数由 jsPDF 自己维护
        void pageIdx;
      }

      const baseName = (fileName || "report").replace(/\.[^/.]+$/, "");
      pdf.save(`${baseName}.pdf`);
    } catch (e) {
      console.error("PDF 生成失败", e);
    } finally {
      setPrinting(false);
    }
  };

  // 直接下载原始 HTML 文件到本地
  const handleDownload = async () => {
    setDownloading(true);
    try {
      let blob;
      if (htmlContent) {
        blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      } else {
        const res = await fetch(fileUrl);
        blob = await res.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "report.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      window.open(fileUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const handleRetry = () => {
    setFetchKey(k => k + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-slate-200 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FileText className="w-4 h-4 text-rose-500" />
            PDF 导出预览
            <span className="text-[11px] font-normal text-slate-500 truncate">· {fileName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* 左:A4 模拟预览 */}
          <div className="flex-1 bg-slate-100 overflow-auto p-6 flex items-start justify-center">
            <div
              className="bg-white shadow-xl border border-slate-300 relative transition-all duration-200"
              style={{ width: previewW, height: previewH, flexShrink: 0 }}
            >
              {fetchLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 gap-2">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  <div className="text-[11.5px] text-slate-500">正在加载预览…</div>
                </div>
              )}
              {fetchError && !fetchLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20 gap-3 px-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="text-[13px] font-semibold text-slate-700">预览加载失败</div>
                  <div className="text-[11.5px] text-slate-500 leading-relaxed max-w-[280px]">
                    {fetchError === '加载超时'
                      ? '报告文件较大或网络较慢。你可以重试,或直接在新标签打开,也可以跳过预览直接下载。'
                      : `加载报错:${fetchError}。建议重试或在新标签打开。`}
                  </div>
                  <div className="flex flex-col gap-1.5 w-full max-w-[220px] mt-1">
                    <Button onClick={handleRetry} size="sm" variant="outline" className="text-[12px] gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> 重试
                    </Button>
                    <Button
                      onClick={() => window.open(fileUrl, "_blank")}
                      size="sm"
                      variant="outline"
                      className="text-[12px] gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> 在新标签打开
                    </Button>
                    <Button
                      onClick={handleDownload}
                      size="sm"
                      disabled={downloading}
                      className="text-[12px] gap-1.5 bg-rose-500 hover:bg-rose-600 text-white"
                    >
                      {downloading
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 下载中…</>
                        : <><Download className="w-3.5 h-3.5" /> 直接下载</>}
                    </Button>
                  </div>
                </div>
              )}
              {/* 边距虚线指示 */}
              {!fetchError && (
                <div
                  className="absolute border border-dashed border-rose-300/60 pointer-events-none z-[5]"
                  style={{
                    top: `${margin * 3.78 * (zoom / 100)}px`,
                    left: `${margin * 3.78 * (zoom / 100)}px`,
                    right: `${margin * 3.78 * (zoom / 100)}px`,
                    bottom: `${margin * 3.78 * (zoom / 100)}px`,
                  }}
                />
              )}
              {htmlContent && !fetchError && (
                <iframe
                  ref={iframeRef}
                  srcDoc={htmlContent}
                  title="PDF 预览"
                  sandbox="allow-same-origin allow-modals allow-popups allow-scripts"
                  className="w-full h-full border-0 bg-white"
                />
              )}
            </div>
          </div>

          {/* 右:微调面板 */}
          <div className="w-64 border-l border-slate-200 bg-white flex flex-col flex-shrink-0">
            <div className="p-4 space-y-5 overflow-y-auto flex-1">
              {/* 方向 */}
              <Field label="纸张方向">
                <div className="grid grid-cols-2 gap-1.5">
                  <SegmentBtn active={orientation === "portrait"} onClick={() => setOrientation("portrait")}>
                    <div className="w-4 h-5 border-2 border-current rounded-sm mx-auto mb-1" />
                    纵向
                  </SegmentBtn>
                  <SegmentBtn active={orientation === "landscape"} onClick={() => setOrientation("landscape")}>
                    <div className="w-5 h-4 border-2 border-current rounded-sm mx-auto mb-1" />
                    横向
                  </SegmentBtn>
                </div>
              </Field>

              {/* 边距 */}
              <Field label={`页边距 · ${margin}mm`}>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full accent-rose-500"
                />
                <div className="grid grid-cols-3 gap-1 mt-1.5">
                  {[10, 14, 20].map(v => (
                    <button
                      key={v}
                      onClick={() => setMargin(v)}
                      className={`text-[10.5px] py-1 rounded border transition ${
                        margin === v ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-600 border-slate-200 hover:border-rose-300"
                      }`}
                    >
                      {v === 10 ? "紧凑" : v === 14 ? "标准" : "宽松"}
                    </button>
                  ))}
                </div>
              </Field>

              {/* 预览缩放(不影响打印) */}
              <Field label={`预览缩放 · ${zoom}%`}>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setZoom(z => Math.max(50, z - 10))}
                    className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    step={10}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-rose-500"
                  />
                  <button
                    onClick={() => setZoom(z => Math.min(150, z + 10))}
                    className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Field>

              <button
                onClick={() => { setOrientation("portrait"); setMargin(14); setZoom(100); }}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 py-1.5 border border-slate-200 rounded hover:bg-slate-50 transition"
              >
                <RotateCcw className="w-3 h-3" />
                重置为默认
              </button>

              <div className="text-[10.5px] text-slate-400 leading-relaxed bg-slate-50 rounded p-2 border border-slate-100">
                💡 点击 <span className="font-semibold text-slate-600">「另存为 PDF」</span> 直接生成 .pdf 文件并下载,当前的方向/边距自动应用,无需任何对话框。
                <br />📥 <span className="font-semibold text-slate-600">「下载源文件」</span> 保存原始 HTML 报告。
              </div>
            </div>

            {/* 底部操作 */}
            <div className="p-3 border-t border-slate-200 space-y-2 flex-shrink-0">
              <Button
                onClick={handleSaveAsPdf}
                disabled={printing || fetchLoading || !!fetchError || !htmlContent}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white gap-1.5"
              >
                {printing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 生成 PDF 中…</>
                ) : (
                  <><Download className="w-4 h-4" /> 另存为 PDF</>
                )}
              </Button>
              <Button
                onClick={handleDownload}
                disabled={downloading}
                variant="outline"
                className="w-full gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                {downloading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 下载中…</>
                ) : (
                  <><Download className="w-4 h-4" /> 下载源文件</>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={onClose}
                className="w-full text-[12px] text-slate-500"
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function SegmentBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] py-2 rounded border transition flex flex-col items-center justify-center ${
        active
          ? "bg-rose-500 text-white border-rose-500"
          : "bg-white text-slate-600 border-slate-200 hover:border-rose-300"
      }`}
    >
      {children}
    </button>
  );
}