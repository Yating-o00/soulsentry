import React, { useRef, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Share2, ImagePlus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { httpRequest } from "@/api/httpClient";
import { base44 } from "@/api/base44Client";
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
  // 公开分享链接（/share/<token>）：扫码者无需登录即可查看与评论
  const [shareUrl, setShareUrl] = useState("");
  // 签卡头像：默认取账号头像，也支持本地上传/移除
  const [avatar, setAvatar] = useState(null);       // dataURL 或同源 URL，null = 不画
  const [accountAvatar, setAccountAvatar] = useState(null);
  const avatarRef = useRef(null);

  // 打开卡片时加载账号头像（仅当用户还没手动换过头像时）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        const url = me?.avatar_url || null;
        if (cancelled) return;
        setAccountAvatar(url);
        setAvatar((prev) => prev ?? url);
      } catch { /* 未登录等场景：不出头像 */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handleAvatarFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    const reader = new FileReader();
    reader.onload = () => { setAvatar(String(reader.result)); toast.success('头像已贴上'); };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  // 头像画到卡片右上角：圆形裁切 + 细线圆环
  const drawAvatar = (ctx) => new Promise((resolve) => {
    if (!avatar) return resolve();
    const img = new Image();
    img.onload = () => {
      const cx = W - 140, cy = 170, r = 40;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      // cover 裁切
      const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      ctx.strokeStyle = "rgba(56,72,119,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      resolve();
    };
    img.onerror = () => resolve();
    img.src = avatar;
  });

  const content = (text || "").trim();
  // 五类签色作丝带点缀，无分类时回落哨兵蓝
  const typeColor = TYPE_META[getNoteType(note)]?.color || "#384877";
  const ai = note?.ai_analysis || note?.metadata?.ai_analysis || {};
  const conv = note?.metadata?.conversation || [];
  const lastReply = [...conv].reverse().find((m) => m.role === "other" && m.text && !m.typing);
  const replyText = ai.emotional_response || lastReply?.text || "";

  // 打开卡片时确保存在公开分享 token：
  // 二维码指向 /share/<token> 公开页，扫码者不用登录就能看签文、留评论
  const isOptimistic = typeof note?.id === "string" && note.id.startsWith("tmp-");
  useEffect(() => {
    if (!open || !note?.id || isOptimistic) return;
    if (shareUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await httpRequest(`/api/public/share/generate/note/${note.id}`, {
          method: "POST",
          body: { enabled: true },
        });
        if (!cancelled && result?.url) setShareUrl(result.url);
      } catch (e) {
        // 生成失败（如未登录/网络问题）：回落到已有的 share_token 或不出二维码
        if (!cancelled && note?.share_token && typeof window !== "undefined") {
          setShareUrl(`${window.location.origin}/share/${note.share_token}`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, note?.id, note?.share_token, isOptimistic, shareUrl]);

  const noteUrl = shareUrl;

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
      // 纸面底：暖白
      ctx.fillStyle = "#fbfaf7";
      ctx.fillRect(0, 0, W, H);

      // 内缩细线框：一道主框 + 一道更浅的副框（极简装裱感）
      ctx.strokeStyle = "rgba(56,72,119,0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(30, 30, W - 60, H - 60);
      ctx.strokeStyle = "rgba(56,72,119,0.10)";
      ctx.strokeRect(38, 38, W - 76, H - 76);

      // 顶部：细线圆圈「心」+ 字距拉开的品牌小字
      ctx.strokeStyle = "rgba(56,72,119,0.5)";
      ctx.beginPath();
      ctx.arc(W / 2, 170, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#384877";
      ctx.font = `500 32px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("心", W / 2, 181);
      ctx.fillStyle = "#9aa3b5";
      ctx.font = `400 20px ${SANS}`;
      const brand = "S O U L S E N T R Y";
      ctx.fillText(brand, W / 2, 244);

      // 用户头像（右上，圆形）
      await drawAvatar(ctx);

      // 签文：衬线居中，一枚浅色大引号
      const fontSize = 34;
      const lineHeight = Math.round(fontSize * 1.9);
      ctx.fillStyle = "rgba(56,72,119,0.10)";
      ctx.font = `700 96px ${SERIF}`;
      ctx.fillText("“", W / 2, 400);
      ctx.fillStyle = "#2c3244";
      ctx.font = `400 ${fontSize}px ${SERIF}`;
      const lines = wrapLines(ctx, content || "（空内容）", 760, 10);
      const textTop = 470;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, textTop + i * lineHeight));

      // 日期 + 类型色圆点小标签（签文下方居中）
      const typeLabel = TYPE_META[getNoteType(note)]?.label || "心签";
      const metaY = textTop + lines.length * lineHeight + 26;
      ctx.font = `400 22px ${SANS}`;
      const dateW = ctx.measureText(dateStr).width;
      const dotR = 5;
      const gap = 14;
      const totalW = dateW + gap + dotR * 2 + gap + ctx.measureText(typeLabel).width;
      let mx = W / 2 - totalW / 2;
      ctx.textAlign = "left";
      ctx.fillStyle = "#8e8e93";
      ctx.fillText(dateStr, mx, metaY);
      mx += dateW + gap;
      ctx.fillStyle = typeColor;
      ctx.beginPath();
      ctx.arc(mx + dotR, metaY - 7, dotR, 0, Math.PI * 2);
      ctx.fill();
      mx += dotR * 2 + gap;
      ctx.fillStyle = "#8e8e93";
      ctx.fillText(typeLabel, mx, metaY);

      // AI 回应（另一个你）：细线分隔后小字斜体灰蓝
      if (replyText) {
        const replyTop = H - (noteUrl ? 460 : 400);
        ctx.strokeStyle = "rgba(56,72,119,0.16)";
        ctx.beginPath();
        ctx.moveTo(W / 2 - 60, replyTop - 40);
        ctx.lineTo(W / 2 + 60, replyTop - 40);
        ctx.stroke();
        ctx.fillStyle = "#6b7a99";
        ctx.font = `italic 400 26px ${SERIF}`;
        const rl = wrapLines(ctx, replyText, 680, 3);
        rl.forEach((l, i) => {
          ctx.textAlign = "center";
          ctx.fillText(l, W / 2, replyTop + i * 48);
        });
      }

      // 底部：细线 + 品牌语居中
      ctx.strokeStyle = "rgba(56,72,119,0.16)";
      ctx.beginPath();
      ctx.moveTo(90, H - 190);
      ctx.lineTo(W - 90, H - 190);
      ctx.stroke();
      ctx.fillStyle = "#8e8e93";
      ctx.font = `400 22px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("心栈 · 说给另一个自己听", W / 2, H - 130);

      // 右下二维码（90px）+「扫码回应」
      if (noteUrl) {
        try {
          const qrUrl = await QRCode.toDataURL(noteUrl, { width: 260, margin: 1, errorCorrectionLevel: "M" });
          await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, W - 90 - 90, H - 360, 90, 90); resolve(); };
            img.onerror = () => resolve();
            img.src = qrUrl;
          });
          ctx.fillStyle = "#b0b0b5";
          ctx.font = `400 18px ${SANS}`;
          ctx.textAlign = "center";
          ctx.fillText("扫码回应", W - 90 - 45, H - 246);
        } catch {
          // 二维码生成失败时静默略过，不影响卡片主体
        }
      }
    };

    draw().catch(() => {});
  }, [open, note, content, replyText, noteUrl, dateStr, typeColor, avatar]);

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

          {/* 头像：贴上 / 换回账号头像 / 移除 */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => avatarRef.current?.click()}
              title="上传图片作为签卡头像"
              className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center border border-dashed border-slate-300 hover:border-[#384877]/50 hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              {avatar ? (
                <img src={avatar} alt="头像" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="w-4 h-4 text-slate-400" />
              )}
            </button>
            <div className="text-xs text-slate-500 flex-1 min-w-0">
              {avatar ? '头像将显示在签卡右上角' : '可选：给签卡贴上你的头像'}
            </div>
            {avatar && accountAvatar && avatar !== accountAvatar && (
              <button
                onClick={() => setAvatar(accountAvatar)}
                title="换回账号头像"
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#384877] hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            {avatar && (
              <button
                onClick={() => setAvatar(null)}
                title="移除头像"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
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

          {/* 公开链接：扫码/打开均免登录可评论 */}
          {shareUrl && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl).then(
                  () => toast.success("公开链接已复制，扫码或打开均可免登录评论"),
                  () => toast.error("复制失败")
                );
              }}
              className="w-full flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-left transition-colors hover:border-[#384877]/40 hover:bg-slate-50"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0 text-[#384877]" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">{shareUrl}</span>
              <Copy className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>);

}
