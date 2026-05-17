import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, ZoomIn, ZoomOut, RotateCcw, FileText, Loader2 } from "lucide-react";

// PDF 导出前的可视化预览 + 微调
// 设计:左侧 A4 模拟纸面 iframe 直接加载 HTML 报告;右侧调节面板(纸张方向/边距/缩放)
// 确认后注入临时 <style> 覆写 @page 与缩放,再唤起 iframe.contentWindow.print()
export default function PdfExportPreviewDialog({ open, onClose, fileUrl, fileName }) {
  const iframeRef = useRef(null);
  const [orientation, setOrientation] = useState("portrait"); // portrait | landscape
  const [margin, setMargin] = useState(14); // mm,统一四边
  const [zoom, setZoom] = useState(100); // 屏幕预览缩放比 %,不影响打印
  const [iframeLoading, setIframeLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  // 每次打开重置参数
  useEffect(() => {
    if (open) {
      setOrientation("portrait");
      setMargin(14);
      setZoom(100);
      setIframeLoading(true);
    }
  }, [open, fileUrl]);

  // A4 屏幕预览尺寸(mm 等比换算成 px,1mm ≈ 3.78px)
  const A4 = orientation === "portrait"
    ? { w: 210, h: 297 }
    : { w: 297, h: 210 };
  const previewW = Math.round(A4.w * 3.78 * (zoom / 100));
  const previewH = Math.round(A4.h * 3.78 * (zoom / 100));

  // 把当前微调注入 iframe 的 head,然后调它的 window.print()
  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe?.contentWindow) {
      // 跨域兜底:新标签打开 + 延时 print
      const win = window.open(fileUrl, "_blank");
      if (win) setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 1800);
      return;
    }
    setPrinting(true);
    try {
      const doc = iframe.contentDocument;
      // 移除上次注入的 override,避免叠加
      doc.getElementById("__pdf_export_override__")?.remove();
      const style = doc.createElement("style");
      style.id = "__pdf_export_override__";
      style.textContent = `
        @media print {
          @page { size: A4 ${orientation}; margin: ${margin}mm; }
        }
      `;
      doc.head.appendChild(style);
      // 等样式生效再打印
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
              {iframeLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              )}
              {/* 边距虚线指示 */}
              <div
                className="absolute border border-dashed border-rose-300/60 pointer-events-none z-[5]"
                style={{
                  top: `${margin * 3.78 * (zoom / 100)}px`,
                  left: `${margin * 3.78 * (zoom / 100)}px`,
                  right: `${margin * 3.78 * (zoom / 100)}px`,
                  bottom: `${margin * 3.78 * (zoom / 100)}px`,
                }}
              />
              <iframe
                ref={iframeRef}
                src={fileUrl}
                title="PDF 预览"
                onLoad={() => setIframeLoading(false)}
                className="w-full h-full border-0 bg-white"
              />
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
                💡 点击「另存为 PDF」后,在浏览器打印对话框的目标里选择
                <span className="font-semibold text-slate-600">「另存为 PDF」</span>
                即可下载。当前微调会自动应用到打印输出。
              </div>
            </div>

            {/* 底部操作 */}
            <div className="p-3 border-t border-slate-200 space-y-2 flex-shrink-0">
              <Button
                onClick={handlePrint}
                disabled={iframeLoading || printing}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white gap-1.5"
              >
                {printing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 准备打印…</>
                ) : (
                  <><Printer className="w-4 h-4" /> 另存为 PDF</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="w-full text-[12px]"
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