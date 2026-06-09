import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  "愿你被爱包围，也勇敢去爱。",
];

// 与气泡一致的柔和色板：决定卡片主题色
const THEMES = {
  white:    { from: "#6366f1", to: "#8b5cf6", soft: "#eef2ff", text: "#4338ca" },
  red:      { from: "#f43f5e", to: "#fb7185", soft: "#fff1f2", text: "#be123c" },
  orange:   { from: "#f97316", to: "#fb923c", soft: "#fff7ed", text: "#c2410c" },
  yellow:   { from: "#f59e0b", to: "#fbbf24", soft: "#fffbeb", text: "#b45309" },
  green:    { from: "#10b981", to: "#34d399", soft: "#ecfdf5", text: "#047857" },
  teal:     { from: "#14b8a6", to: "#2dd4bf", soft: "#f0fdfa", text: "#0f766e" },
  blue:     { from: "#0ea5e9", to: "#38bdf8", soft: "#f0f9ff", text: "#0369a1" },
  darkblue: { from: "#4f46e5", to: "#6366f1", soft: "#eef2ff", text: "#4338ca" },
  purple:   { from: "#8b5cf6", to: "#a78bfa", soft: "#f5f3ff", text: "#6d28d9" },
  pink:     { from: "#ec4899", to: "#f472b6", soft: "#fdf2f8", text: "#be185d" },
  brown:    { from: "#a8a29e", to: "#d6d3d1", soft: "#fafaf9", text: "#57534e" },
  gray:     { from: "#64748b", to: "#94a3b8", soft: "#f8fafc", text: "#475569" },
};

export default function HeartSignShareCard({ note, text, open, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  const theme = THEMES[note?.color] || THEMES.white;
  const content = (text || "").trim();

  const [encouragement] = useState(
    () => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]
  );

  const noteUrl = typeof window !== "undefined" && note?.id
    ? `${window.location.origin}${createPageUrl("HeartSign")}?noteId=${note.id}`
    : "";
  const qrCodeUrl = noteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(noteUrl)}&bgcolor=ffffff`
    : "";

  const dateStr = (() => {
    const d = note?.created_date ? new Date(note.created_date) : new Date();
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric",
    }).format(d);
    return parts;
  })();

  const capture = async () => {
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
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
          <div className="flex justify-center bg-slate-100/60 p-4 rounded-2xl">
            <div ref={cardRef} className="w-[360px] relative">
              <div
                className="relative rounded-[28px] overflow-hidden shadow-xl"
                style={{ background: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
              >
                {/* 柔光装饰 */}
                <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/15 blur-2xl" />
                <div className="absolute bottom-10 -left-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />

                <div className="relative z-10 p-6">
                  {/* 头部 */}
                  <div className="flex items-center gap-2 text-white/90 mb-6">
                    <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                      <Heart className="w-4 h-4 text-white" />
                    </div>
                    <div className="leading-tight">
                      <p className="text-[13px] font-semibold tracking-wide">心签</p>
                      <p className="text-[10px] text-white/70">给自己的一句话</p>
                    </div>
                    <span className="ml-auto text-[10px] text-white/70">{dateStr}</span>
                  </div>

                  {/* 正文卡片 */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm">
                    <Quote className="w-5 h-5 mb-2" style={{ color: theme.from, opacity: 0.5 }} />
                    <p className="text-[15px] leading-[1.85] text-slate-800 whitespace-pre-wrap break-words">
                      {content || "（空内容）"}
                    </p>

                    {/* 暖心寄语 */}
                    <div
                      className="mt-4 pt-4 border-t flex items-start gap-2"
                      style={{ borderColor: `${theme.from}22` }}
                    >
                      <Heart className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: theme.text }} />
                      <p className="text-[13px] leading-relaxed font-medium" style={{ color: theme.text }}>
                        {encouragement}
                      </p>
                    </div>
                  </div>

                  {/* 底部署名 + 二维码 */}
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/90">
                      <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                        <Heart className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="leading-tight">
                        <p className="text-[11.5px] font-bold tracking-wide">心栈 SoulSentry</p>
                        <p className="text-[9.5px] text-white/70">坚定守护，适时轻唤</p>
                      </div>
                    </div>
                    {qrCodeUrl && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/70">扫码<br />查看</span>
                        <div className="w-12 h-12 bg-white rounded-lg p-0.5 shadow-sm">
                          <img src={qrCodeUrl} alt="QR" crossOrigin="anonymous" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-3 gap-2.5">
            <Button onClick={handleDownload} disabled={generating} variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
              <Download className="w-4 h-4 mr-1.5" />
              {generating ? "生成中" : "下载"}
            </Button>
            <Button onClick={handleCopyImage} disabled={generating} variant="outline" className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
              <Copy className="w-4 h-4 mr-1.5" />
              复制图
            </Button>
            <Button onClick={handleCopyText} variant="outline" className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
              <Copy className="w-4 h-4 mr-1.5" />
              复制文
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}