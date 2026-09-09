import React, { useRef, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import QRCode from "qrcode";
import { getNoteType, TYPE_META } from "@/components/heartsign/heartSignMeta";

const W = 1080;
const H = 1350;
const SERIF = '"Songti SC","STSong","SimSun",serif';
const SANS = '"-apple-system","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

// 正文换行：按像素宽度折行，超长截断并加省略号
function wrapLines(ctx, text, maxW, maxLines) {
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW) {
        lines.push(line);
        line = ch;
        if (lines.length >= maxLines) return lines;
      } else {
        line += ch;
      }
    }
    lines.push(line);
    if (lines.length >= maxLines) return lines;
  }
  return lines;
}

// 分享签卡：原生 Canvas 绘制（1080×1350，小程序品牌风 + 五类签色）
export default function HeartSignShareCard({ note, text, open, onClose }) {
  const canvasRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  const content = (text || "").trim();
  // 五类签色作丝带点缀，无分类时回落哨兵蓝
  const typeColor = TYPE_META[getNoteType(note)]?.color || "#384877";
  const ai = note?.ai_analysis || note?.metadata?.ai_analysis || {};
  const conv = note?.metadata?.conversation || [];
  const lastReply = [...conv].reverse().find((m) => m.role === "other" && m.text && !m.typing);
  const replyText = ai.emotional_response || lastReply?.text || "";

  // 二维码固定指向正式域名，避免微信将预览沙箱链接判定为风险站点而拦截
  const noteUrl = note?.id ?
  `https://xinzhan-soulsentry.com${createPageUrl("Notes")}?noteId=${note.id}` :
  "";

  const dateStr = (() => {
    const d = note?.created_date ? new Date(note.created_date) : new Date();
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric"
    }).format(d);
  })();

  useEffect(() => {
    if (!open || !note || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = async () => {
      // 纸面渐变底
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#fbfcfd");
      g.addColorStop(1, "#eef2f7");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 右上「签」丝带（五类签色）
      ctx.fillStyle = typeColor;
      ctx.fillRect(W - 190, 0, 74, 130);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 44px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("签", W - 153, 86);

      // 头部：logo + 标题 + 日期
      ctx.textAlign = "left";
      ctx.fillStyle = typeColor;
      const rr = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
      };
      rr(90, 64, 56, 56, 14);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 30px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.fillText("心", 118, 104);
      ctx.textAlign = "left";
      ctx.fillStyle = "#1c1c1e";
      ctx.font = `600 30px ${SANS}`;
      ctx.fillText("心栈 · 心签", 166, 102);
      ctx.fillStyle = "#8e8e93";
      ctx.font = `400 22px ${SANS}`;
      ctx.textAlign = "right";
      ctx.fillText(dateStr, W - 90, 100);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(90, 150);
      ctx.lineTo(W - 90, 150);
      ctx.stroke();

      // 正文签文：字号随长度自适应
      const len = content.length;
      const fontSize = len > 280 ? 34 : len > 160 ? 38 : len > 60 ? 44 : 52;
      const lineHeight = Math.round(fontSize * 1.75);
      ctx.fillStyle = typeColor;
      ctx.globalAlpha = 0.3;
      ctx.font = `700 ${fontSize + 38}px ${SERIF}`;
      ctx.fillText("“", 86, 250 + fontSize);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#1c1c1e";
      ctx.font = `400 ${fontSize}px ${SERIF}`;
      const lines = wrapLines(ctx, content || "（空内容）", 900, 9);
      lines.forEach((l, i) => ctx.fillText(l, 90, 320 + i * lineHeight));

      // AI 回应（另一个你）
      const replyTop = H - (replyText ? 420 : 240);
      if (replyText) {
        ctx.fillStyle = typeColor;
        ctx.font = `500 22px ${SANS}`;
        ctx.textAlign = "left";
        ctx.fillText("— 另一个你 —", 90, replyTop);
        ctx.fillStyle = "#5b6572";
        ctx.font = `400 30px ${SERIF}`;
        const rl = wrapLines(ctx, replyText, 700, 3);
        rl.forEach((l, i) => ctx.fillText(l, 90, replyTop + 62 + i * 52));
      }

      // 底部：日期 + 品牌语 + 二维码
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(90, H - 150);
      ctx.lineTo(W - 90, H - 150);
      ctx.stroke();
      ctx.fillStyle = "#8e8e93";
      ctx.font = `400 22px ${SANS}`;
      ctx.textAlign = "left";
      ctx.fillText(dateStr, 90, H - 96);
      ctx.textAlign = "right";
      ctx.fillText("心栈 SoulSentry · 说给另一个自己听", W - 90, H - 96);
      ctx.textAlign = "left";

      if (noteUrl) {
        try {
          const qrUrl = await QRCode.toDataURL(noteUrl, { width: 260, margin: 1, errorCorrectionLevel: "M" });
          await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, W - 90 - 104, H - 330, 104, 104); resolve(); };
            img.onerror = () => resolve();
            img.src = qrUrl;
          });
          ctx.fillStyle = "#b0b0b5";
          ctx.font = `400 18px ${SANS}`;
          ctx.textAlign = "right";
          ctx.fillText("扫码查看", W - 90, H - 200);
          ctx.textAlign = "left";
        } catch {
          // 二维码生成失败时静默略过，不影响卡片主体
        }
      }
    };

    draw().catch(() => {});
  }, [open, note, content, replyText, noteUrl, dateStr, typeColor]);

  const handleDownload = async () => {
    if (!canvasRef.current) return;
    setGenerating(true);
    try {
      const link = document.createElement("a");
      link.download = `心签-${Date.now()}.png`;
      link.href = canvasRef.current.toDataURL("image/png", 0.95);
      link.click();
      toast.success("签卡已保存");
    } catch (e) {
      toast.error("生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyImage = async () => {
    if (!canvasRef.current) return;
    setGenerating(true);
    try {
      const blob = await new Promise((r) => canvasRef.current.toBlob(r, "image/png", 0.95));
      if (!blob) throw new Error("生成失败");
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("签卡已复制到剪贴板");
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
    const out = `【心签】\n\n${content}${replyText ? `\n\n—— 另一个你 ——\n${replyText}` : ""}\n\n—— 心栈 SoulSentry · ${dateStr}`;
    try {
      await navigator.clipboard.writeText(out);
      toast.success("签卡文字已复制");
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
            <Share2 className="w-4 h-4" style={{ color: typeColor }} />
            分享签卡
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* 预览区 */}
          <div className="flex justify-center p-4 rounded-2xl bg-slate-50">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="w-[320px] rounded-2xl"
              style={{ boxShadow: "0 10px 34px rgba(56,72,119,0.18)" }}
            />
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-3 gap-2.5">
            <Button
              onClick={handleDownload}
              disabled={generating}
              className="text-white shadow-sm hover:opacity-90 transition-opacity border-0"
              style={{ background: `linear-gradient(135deg, #384877, #3b5aa2)` }}>

              <Download className="w-4 h-4 mr-1.5" />
              {generating ? "生成中" : "下载"}
            </Button>
            <Button
              onClick={handleCopyImage}
              disabled={generating}
              variant="outline"
              className="bg-white hover:bg-transparent transition-colors"
              style={{ borderColor: "#38487755", color: "#384877" }}>

              <Copy className="w-4 h-4 mr-1.5" />
              复制图
            </Button>
            <Button
              onClick={handleCopyText}
              variant="outline"
              className="bg-white hover:bg-transparent transition-colors"
              style={{ borderColor: "#38487755", color: "#384877" }}>

              <Copy className="w-4 h-4 mr-1.5" />
              复制文
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>);

}
