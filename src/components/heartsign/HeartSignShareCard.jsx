import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Share2, Heart, Quote } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import html2canvas from "html2canvas";

const ENCOURAGEMENTS = [
"你已经做得很好了，请对自己温柔一点。",
"慢慢来，一切都会好起来的。",
"你值得被世界温柔以待。",
"每一个努力的当下，都在悄悄发光。",
"允许自己休息，也允许自己慢慢变好。",
"你比想象中更坚强，也更可爱。",
"今天也辛苦了，记得给自己一个拥抱。",
"星光不问赶路人，时光不负有心人。",
"别急，好的事情正在路上。",
"愿你被爱包围，也勇敢去爱。"];


// 与气泡一致的柔和色板：决定卡片主题色
const THEMES = {
  white: { from: "#6366f1", to: "#8b5cf6", soft: "#eef2ff", text: "#4338ca" },
  red: { from: "#f43f5e", to: "#fb7185", soft: "#fff1f2", text: "#be123c" },
  orange: { from: "#f97316", to: "#fb923c", soft: "#fff7ed", text: "#c2410c" },
  yellow: { from: "#f59e0b", to: "#fbbf24", soft: "#fffbeb", text: "#b45309" },
  green: { from: "#10b981", to: "#34d399", soft: "#ecfdf5", text: "#047857" },
  teal: { from: "#14b8a6", to: "#2dd4bf", soft: "#f0fdfa", text: "#0f766e" },
  blue: { from: "#0ea5e9", to: "#38bdf8", soft: "#f0f9ff", text: "#0369a1" },
  darkblue: { from: "#4f46e5", to: "#6366f1", soft: "#eef2ff", text: "#4338ca" },
  purple: { from: "#8b5cf6", to: "#a78bfa", soft: "#f5f3ff", text: "#6d28d9" },
  pink: { from: "#ec4899", to: "#f472b6", soft: "#fdf2f8", text: "#be185d" },
  brown: { from: "#a8a29e", to: "#d6d3d1", soft: "#fafaf9", text: "#57534e" },
  gray: { from: "#64748b", to: "#94a3b8", soft: "#f8fafc", text: "#475569" }
};

export default function HeartSignShareCard({ note, text, open, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  // 统一使用产品科技蓝主题色调
  const theme = { from: "#384877", to: "#3b5aa2", soft: "#eef2f7", text: "#384877" };
  const content = (text || "").trim();

  // 正文字号随内容长度自适应，长内容也能保持优雅排版
  const bodyStyle = (() => {
    const len = content.length;
    if (len > 280) return { fontSize: "13px", lineHeight: 1.85 };
    if (len > 160) return { fontSize: "14.5px", lineHeight: 1.95 };
    if (len > 60) return { fontSize: "16px", lineHeight: 2 };
    return { fontSize: "18px", lineHeight: 2.1 };
  })();

  const [encouragement] = useState(
    () => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]
  );

  // 二维码固定指向正式域名，避免微信将预览沙箱链接判定为风险站点而拦截
  const noteUrl = note?.id ?
  `https://xinzhan-soulsentry.com${createPageUrl("HeartSign")}?noteId=${note.id}` :
  "";
  const qrCodeUrl = noteUrl ?
  `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(noteUrl)}&bgcolor=ffffff` :
  "";

  const dateStr = (() => {
    const d = note?.created_date ? new Date(note.created_date) : new Date();
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric"
    }).format(d);
    return parts;
  })();

  const capture = async () => {
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true
    });
    return canvas;
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const canvas = await capture();
      const link = document.createElement("a");
      link.download = `心签-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png", 0.95);
      link.click();
      toast.success("心签卡片已保存");
    } catch (e) {
      toast.error("生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const canvas = await capture();
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png", 0.95));
      if (!blob) throw new Error("生成失败");
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("心签卡片已复制到剪贴板");
      } else {
        throw new Error("浏览器不支持复制图片");
      }
    } catch (e) {
      toast.error(e.message || "复制失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyText = async () => {
    const out = `【心签】\n\n${content}\n\n💛 ${encouragement}\n\n—— 来自心灵存放站 · ${dateStr}`;
    try {
      await navigator.clipboard.writeText(out);
      toast.success("心签文本已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  if (!note) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="w-4 h-4" style={{ color: theme.text }} />
            分享心签卡片
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* 预览区 */}
          <div className="flex justify-center p-5 rounded-2xl bg-slate-50">
            <div ref={cardRef} className="w-[360px] relative">
              <div className="relative bg-white rounded-[20px] overflow-hidden border border-slate-100 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12)]">
                {/* 顶部主题色细条 */}
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${theme.from}, ${theme.to})` }} />

                <div className="relative z-10 px-7 pt-7 pb-6">
                  {/* 头部 */}
                  <div className="flex items-center justify-between mb-7">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}>
                        
                        <Heart className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span
                        className="text-[17px] font-bold tracking-[0.06em] mx-2 px-1"
                        style={{ color: theme.text }}>
                        
                        心签
                      </span>
                    </div>
                    <span className="text-[10px] tracking-wide text-slate-400">{dateStr}</span>
                  </div>

                  {/* 正文 */}
                  <Quote className="w-6 h-6 mb-3" style={{ color: theme.from, opacity: 0.35 }} />
                  <p className="text-slate-800 whitespace-pre-wrap break-words px-3" style={bodyStyle}>
                    {content || "（空内容）"}
                  </p>

                  {/* 暖心寄语 */}
                  <div className="mt-7 pt-5 border-t border-slate-100">
                    <p className="text-[13px] leading-relaxed text-slate-500 italic">
                      {encouragement}
                    </p>
                  </div>

                  {/* 底部署名 + 二维码 */}
                  <div className="mt-7 pt-5 border-t border-slate-100 flex items-center justify-between">
                    <div className="leading-tight">
                      <p className="text-[12px] font-semibold tracking-wide text-slate-700">心栈 SoulSentry</p>
                      <p className="text-[9.5px] text-slate-400 mt-0.5">坚定守护，适时轻唤</p>
                    </div>
                    {qrCodeUrl &&
                    <div className="flex items-center gap-2">
                        <span className="text-[9.5px] text-slate-400 text-right leading-tight">扫码<br />查看</span>
                        <div className="w-9 h-9 bg-white rounded-md p-0.5 border border-slate-100">
                          <img src={qrCodeUrl} alt="QR" crossOrigin="anonymous" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-3 gap-2.5">
            <Button
              onClick={handleDownload}
              disabled={generating}
              className="text-white shadow-sm hover:opacity-90 transition-opacity border-0"
              style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}>
              
              <Download className="w-4 h-4 mr-1.5" />
              {generating ? "生成中" : "下载"}
            </Button>
            <Button
              onClick={handleCopyImage}
              disabled={generating}
              variant="outline"
              className="bg-white hover:bg-transparent transition-colors"
              style={{ borderColor: `${theme.from}55`, color: theme.text }}>
              
              <Copy className="w-4 h-4 mr-1.5" />
              复制图
            </Button>
            <Button
              onClick={handleCopyText}
              variant="outline"
              className="bg-white hover:bg-transparent transition-colors"
              style={{ borderColor: `${theme.from}55`, color: theme.text }}>
              
              <Copy className="w-4 h-4 mr-1.5" />
              复制文
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>);

}