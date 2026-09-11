import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Image } from "@tarojs/components";
import createQRCode from "@/lib/qrcode";
import { get } from "@/utils/api";

const BASE_WIDTH = 640;
const THEME = "#384877";
const THEME_LIGHT = "#3b5aa2";

// 心签类型色（与 Web 端 heartSignMeta 口径一致）
const NOTE_TYPE_META = {
  emotion: { label: "情绪", color: "#c97b8a" },
  inspiration: { label: "灵感", color: "#d97706" },
  material: { label: "资料", color: "#5b82a0" },
  memo: { label: "备忘", color: "#8a7d6b" },
  share: { label: "分享", color: "#6e8a73" },
  ledger: { label: "账本", color: "#a08452" }
};

// 签卡日期：YYYY年M月D日（与 Web 端 Intl zh-CN long 格式一致）
function formatCardDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// 所有尺寸基于 640px 基准画布，实际绘制时按 s = W / BASE_WIDTH 缩放。
// 统一使用 textBaseline = 'top'，y 坐标表示当前文字/元素的顶部位置，
// lineH 表示一行文字顶部到下一行文字顶部的距离，已包含字体高度和安全间距。
const LAYOUT = {
  pad: 48,
  topBarH: 8,
  headerFont: 24,
  headerGap: 36,
  titleFont: 36,
  titleFontLong: 30,
  titleLineH: 64,
  titleLineHLong: 54,
  titleMaxLines: 4,
  descFont: 26,
  descLineH: 54,
  descMaxLines: 6,
  noteDescMaxLines: 30,
  extraFont: 22,
  extraLineH: 46,
  subtaskFont: 24,
  subtaskLineH: 52,
  subtaskBulletOffset: 32,
  subtaskGap: 20,
  subtaskMaxLines: 2,
  subtaskMaxCount: 8,
  sectionGap: 32,
  separatorGap: 36,
  footerBrandFont: 26,
  footerTipFont: 18,
  footerTipGap: 8,
  qrSize: 120,
  bottomPad: 48
};

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function wrapText(ctx, text, maxWidth) {
  // 先按原文的换行符拆分成段落，保留用户手动输入的换行。
  // 对每一段再按宽度自动换行。
  const raw = String(text || "");
  const paragraphs = raw.split(/\r?\n/);
  const lines = [];

  // 部分环境下 Canvas 2D 字体未就绪时 measureText 会返回 0，
  // 此时按当前字体大小估算中文字符宽度作为 fallback。
  const probeWidth = ctx.measureText("中").width;
  const fontSize = parseInt(ctx.font) || 26;
  const fallbackCharWidth = probeWidth > 0 ? 0 : fontSize;

  const wrapLine = (paragraph) => {
    const chars = paragraph.split("");
    let line = "";
    for (const char of chars) {
      const test = line + char;
      let width = ctx.measureText(test).width;
      if (fallbackCharWidth && width === 0) {
        width = test.length * fallbackCharWidth;
      }
      if (width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  };

  paragraphs.forEach((paragraph, index) => {
    // 连续换行会产生空段落，保留为一个空行。
    if (paragraph === "") {
      // 仅在段落确实由换行符分隔时才插入空行，避免末尾多余空行。
      if (index < paragraphs.length - 1) {
        lines.push("");
      }
      return;
    }
    wrapLine(paragraph);
  });

  return lines;
}

function drawQRCode(ctx, text, x, y, size) {
  try {
    const qr = createQRCode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cell = size / count;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillStyle = "#1f2937";
          ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
        }
      }
    }
  } catch (err) {
    console.error("QR draw failed", err);
  }
}

function measureLayout(ctx, title, description, extra, subtasks, isNote) {
  const {
    pad,
    topBarH,
    headerFont,
    headerGap,
    titleFont,
    titleFontLong,
    titleLineH,
    titleLineHLong,
    titleMaxLines,
    descFont,
    descLineH,
    descMaxLines,
    noteDescMaxLines,
    extraLineH,
    subtaskFont,
    subtaskLineH,
    subtaskBulletOffset,
    subtaskGap,
    subtaskMaxLines,
    subtaskMaxCount,
    sectionGap,
    separatorGap,
    qrSize,
    bottomPad
  } = LAYOUT;

  let y = pad + topBarH;

  y += headerFont + headerGap;

  const titleText = String(title || "未命名").trim();
  const useLongTitle = titleText.length > 40;
  const titleFontSize = useLongTitle ? titleFontLong : titleFont;
  const titleLineHeight = useLongTitle ? titleLineHLong : titleLineH;
  ctx.font = `${titleFontSize}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  const titleLines = wrapText(ctx, titleText, BASE_WIDTH - pad * 2).slice(0, titleMaxLines);
  y += titleLines.length * titleLineHeight;
  const titleMeta = { text: titleText, lines: titleLines, fontSize: titleFontSize, lineHeight: titleLineHeight };

  let descLines = [];
  if (description) {
    y += sectionGap;
    ctx.font = `${descFont}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    const maxLines = isNote ? noteDescMaxLines : descMaxLines;
    descLines = wrapText(ctx, String(description).trim(), BASE_WIDTH - pad * 2).slice(0, maxLines);
    y += descLines.length * descLineH;
  }

  if (extra) {
    y += sectionGap;
    y += extraLineH;
  }

  let subtaskMeta = [];
  if (!isNote && subtasks && subtasks.length > 0) {
    y += sectionGap;
    const visibleSubtasks = subtasks.slice(0, subtaskMaxCount);
    visibleSubtasks.forEach((sub) => {
      ctx.font = `${subtaskFont}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const lines = wrapText(ctx, sub.title, BASE_WIDTH - pad * 2 - subtaskBulletOffset).slice(0, subtaskMaxLines);
      const itemH = Math.max(lines.length * subtaskLineH + subtaskGap, 56);
      subtaskMeta.push({ ...sub, lines, itemH });
      y += itemH;
    });
  }

  y += sectionGap;
  y += separatorGap;
  y += qrSize;
  y += bottomPad;

  return {
    totalHeight: y,
    title: titleMeta,
    description: descLines,
    subtasks: subtaskMeta
  };
}

export default function SharePoster({ visible, onClose, type, title, description, extra, subtasks = [], shareToken, canvasId, noteType, date }) {
  const [posterUrl, setPosterUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: BASE_WIDTH, height: 960 });

  const generatedRef = useRef(false);
  const generatingRef = useRef(false);

  const link = shareToken ? `https://www.xinzhan-soulsentry.cn/share/${shareToken}` : "";
  const isNote = type === "note";

  useEffect(() => {
    if (!visible) {
      setPosterUrl("");
      generatedRef.current = false;
      return;
    }
    if (!shareToken || generatedRef.current) return;
    generatedRef.current = true;

    Taro.nextTick(() => {
      generatePoster();
    });

    return () => {
      generatedRef.current = false;
    };
  }, [visible, shareToken]);

  const generatePoster = () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setPosterUrl("");

    try {
      const sys = Taro.getSystemInfoSync();
      const winWidth = sys.windowWidth || 375;
      const widthPx = Math.round(winWidth * 0.9);

      // 心签：与 Web 端签卡一致的固定比例（1080×1350 布局等比缩放）
      if (isNote) {
        const totalHeight = Math.round(widthPx * 1.25);
        setCanvasSize({ width: widthPx, height: totalHeight });
        const canvas = createOffscreenCanvas(widthPx, totalHeight);
        const ctx = canvas.getContext("2d");
        loadAvatarImage(canvas).then((avatarImg) => {
          try {
            drawNotePoster(ctx, widthPx, totalHeight, { avatarImg });
            exportCanvas(canvas, widthPx, totalHeight);
          } catch (err) {
            console.error("generate poster failed", err);
            setGenerating(false);
            generatingRef.current = false;
          }
        });
        return;
      }

      // 先用一个临时 canvas 测量布局
      const measureCanvas = createOffscreenCanvas(widthPx, 3000);
      const measureCtx = measureCanvas.getContext("2d");
      const layout = measureLayout(measureCtx, title, description, extra, subtasks, isNote);
      const totalHeight = Math.round(widthPx * (layout.totalHeight / BASE_WIDTH));

      setCanvasSize({ width: widthPx, height: totalHeight });

      // 用正确高度重新创建离屏 canvas 并绘制
      const canvas = createOffscreenCanvas(widthPx, totalHeight);
      const ctx = canvas.getContext("2d");
      drawPoster(ctx, widthPx, totalHeight, layout);

      exportCanvas(canvas, widthPx, totalHeight);
    } catch (err) {
      console.error("generate poster failed", err);
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  const createOffscreenCanvas = (w, h) => {
    if (process.env.TARO_ENV === "weapp" && typeof wx !== "undefined" && wx.createOffscreenCanvas) {
      return wx.createOffscreenCanvas({ type: "2d", width: w, height: h });
    }
    // fallback：H5 等环境创建一个内存 canvas（实际不会用到）
    if (typeof document !== "undefined") {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    }
    throw new Error("离屏 canvas 不可用");
  };

  const exportCanvas = (canvas, W, H) => {
    if (process.env.TARO_ENV === "weapp" && typeof wx !== "undefined") {
      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        success: (res) => {
          setPosterUrl(res.tempFilePath);
          setGenerating(false);
          generatingRef.current = false;
        },
        fail: (err) => {
          console.error("canvasToTempFilePath failed", err);
          setGenerating(false);
          generatingRef.current = false;
          Taro.showToast({ title: "卡片生成失败", icon: "none" });
        }
      });
    }
  };

  // 账号头像 → canvas Image（失败时返回 null，回落「心」圆圈）
  const loadAvatarImage = (canvas) =>
    new Promise((resolve) => {
      (async () => {
        try {
          const me = await get("/users/me", {}, { silent: true });
          let url = me?.avatar_url;
          if (!url) return resolve(null);
          if (url.startsWith("/")) {
            const rawApi = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";
            const origin = rawApi.replace(/\/api\/?$/, "");
            url = origin + url;
          }
          const info = await Taro.getImageInfo({ src: url });
          const img = canvas.createImage();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = info.path;
        } catch {
          resolve(null);
        }
      })();
    });

  // 心签签卡：复刻 Web 端 HeartSignShareCard 布局（1080×1350 基准，s = W/1080）
  const drawNotePoster = (ctx, W, H, { avatarImg } = {}) => {
    const s = W / 1080;
    const SERIF = '"Songti SC","STSong",serif';
    const SANS = '"PingFang SC","Microsoft YaHei",sans-serif';
    const meta = NOTE_TYPE_META[noteType] || { label: "心签", color: "#384877" };
    const typeColor = meta.color;
    const content = String(description || "").trim() || "（空内容）";
    const replyText = String(extra || "").trim();
    const dateStr = formatCardDate(date);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // 纸面底：暖白
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, W, H);

    // 内缩双细线框
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeStyle = "rgba(56,72,119,0.28)";
    ctx.strokeRect(30 * s, 30 * s, W - 60 * s, H - 60 * s);
    ctx.strokeStyle = "rgba(56,72,119,0.10)";
    ctx.strokeRect(38 * s, 38 * s, W - 76 * s, H - 76 * s);

    // 顶部：有头像时圆形头像替代「心」圆圈，否则细线圆圈「心」
    const cx = W / 2, cy = 170 * s, r = 34 * s;
    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const scale = Math.max((r * 2) / avatarImg.width, (r * 2) / avatarImg.height);
      const iw = avatarImg.width * scale, ih = avatarImg.height * scale;
      ctx.drawImage(avatarImg, cx - iw / 2, cy - ih / 2, iw, ih);
      ctx.restore();
      ctx.strokeStyle = "rgba(56,72,119,0.4)";
      ctx.lineWidth = Math.max(1, 2 * s);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3 * s, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(56,72,119,0.5)";
      ctx.lineWidth = Math.max(1, s);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#384877";
      ctx.font = `500 ${Math.round(32 * s)}px ${SERIF}`;
      ctx.fillText("心", cx, cy + 11 * s);
    }
    ctx.fillStyle = "#9aa3b5";
    ctx.font = `400 ${Math.round(20 * s)}px ${SANS}`;
    ctx.fillText("S O U L S E N T R Y", W / 2, 244 * s);

    // 签文：浅色大引号 + 衬线居中，最多 10 行
    const fontSize = 34 * s;
    const lineHeight = Math.round(34 * 1.9) * s;
    ctx.fillStyle = "rgba(56,72,119,0.10)";
    ctx.font = `700 ${Math.round(96 * s)}px ${SERIF}`;
    ctx.fillText("“", W / 2, 400 * s);
    ctx.fillStyle = "#2c3244";
    ctx.font = `400 ${Math.round(fontSize)}px ${SERIF}`;
    const lines = wrapText(ctx, content, 760 * s).slice(0, 10);
    const textTop = 470 * s;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, textTop + i * lineHeight));

    // 日期 + 类型色圆点 + 类型标签（整体居中）
    const metaY = textTop + lines.length * lineHeight + 26 * s;
    ctx.font = `400 ${Math.round(22 * s)}px ${SANS}`;
    const dateW = dateStr ? ctx.measureText(dateStr).width : 0;
    const dotR = 5 * s;
    const gap = 14 * s;
    const labelW = ctx.measureText(meta.label).width;
    const totalW = dateW + (dateStr ? gap : 0) + dotR * 2 + gap + labelW;
    let mx = W / 2 - totalW / 2;
    ctx.textAlign = "left";
    if (dateStr) {
      ctx.fillStyle = "#8e8e93";
      ctx.fillText(dateStr, mx, metaY);
      mx += dateW + gap;
    }
    ctx.fillStyle = typeColor;
    ctx.beginPath();
    ctx.arc(mx + dotR, metaY - 7 * s, dotR, 0, Math.PI * 2);
    ctx.fill();
    mx += dotR * 2 + gap;
    ctx.fillStyle = "#8e8e93";
    ctx.fillText(meta.label, mx, metaY);

    // AI 回应（另一个你）：短线分隔 + 斜体灰蓝，最多 3 行
    if (replyText) {
      const replyTop = H - (link ? 460 : 400) * s;
      ctx.strokeStyle = "rgba(56,72,119,0.16)";
      ctx.lineWidth = Math.max(1, s);
      ctx.beginPath();
      ctx.moveTo(W / 2 - 60 * s, replyTop - 40 * s);
      ctx.lineTo(W / 2 + 60 * s, replyTop - 40 * s);
      ctx.stroke();
      ctx.fillStyle = "#6b7a99";
      ctx.font = `italic 400 ${Math.round(26 * s)}px ${SERIF}`;
      const rl = wrapText(ctx, replyText, 680 * s).slice(0, 3);
      ctx.textAlign = "center";
      rl.forEach((l, i) => ctx.fillText(l, W / 2, replyTop + i * 48 * s));
    }

    // 底部一栏：细线之上，左侧品牌语，右侧二维码 +「扫码回应」
    ctx.strokeStyle = "rgba(56,72,119,0.16)";
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    ctx.moveTo(90 * s, H - 190 * s);
    ctx.lineTo(W - 90 * s, H - 190 * s);
    ctx.stroke();

    ctx.fillStyle = "#8e8e93";
    ctx.font = `400 ${Math.round(22 * s)}px ${SANS}`;
    if (link) {
      ctx.textAlign = "left";
      ctx.fillText("心栈 · 说给另一个自己听", 90 * s, H - 118 * s);
    } else {
      ctx.textAlign = "center";
      ctx.fillText("心栈 · 说给另一个自己听", W / 2, H - 130 * s);
    }

    if (link) {
      const qrSize = 110 * s;
      const qrX = W - 90 * s - qrSize;
      const qrY = H - 172 * s;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      drawQRCode(ctx, link, qrX, qrY, qrSize);
      ctx.fillStyle = "#b0b0b5";
      ctx.font = `400 ${Math.round(18 * s)}px ${SANS}`;
      ctx.textAlign = "right";
      ctx.fillText("扫码回应", qrX - 22 * s, H - 112 * s);
    }
  };

  const drawPoster = (ctx, W, H, layout) => {
    const s = W / BASE_WIDTH;
    const pad = LAYOUT.pad * s;

    ctx.textBaseline = "top";

    // 白底圆角卡片
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 0, 0, W, H, 20 * s);
    ctx.fill();

    // 顶部主题条
    const grd = ctx.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, THEME);
    grd.addColorStop(1, THEME_LIGHT);
    ctx.fillStyle = grd;
    roundRectTop(ctx, 0, 0, W, LAYOUT.topBarH * s, 20 * s);
    ctx.fill();

    let y = pad + LAYOUT.topBarH * s;

    // header
    ctx.fillStyle = THEME;
    ctx.font = `${Math.round(LAYOUT.headerFont * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText(isNote ? "心签" : "约定", pad, y);

    const dateStr = formatDateTime(new Date().toISOString());
    ctx.fillStyle = "#9ca3af";
    ctx.font = `${Math.round(20 * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    const dateWidth = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, W - pad - dateWidth, y + (LAYOUT.headerFont - 20) * s * 0.5);

    if (!isNote) {
      const doneCount = (subtasks || []).filter((t) => t.status === "completed" || t.status === "done").length;
      const total = (subtasks || []).length;
      const statusText = total > 0 ? `完成 ${doneCount}/${total}` : "进行中";
      ctx.fillStyle = doneCount === total && total > 0 ? "#10b981" : THEME;
      ctx.font = `${Math.round(20 * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const statusWidth = ctx.measureText(statusText).width;
      ctx.fillText(statusText, W - pad - dateWidth - statusWidth - 20 * s, y + (LAYOUT.headerFont - 20) * s * 0.5);
    }

    y += (LAYOUT.headerFont + LAYOUT.headerGap) * s;

    // title
    const { title: titleMeta } = layout;
    ctx.fillStyle = "#111827";
    ctx.font = `${Math.round(titleMeta.fontSize * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    titleMeta.lines.forEach((line, idx) => {
      ctx.fillText(line, pad, y + idx * titleMeta.lineHeight * s);
    });
    y += titleMeta.lines.length * titleMeta.lineHeight * s;

    // description
    if (layout.description.length > 0) {
      y += LAYOUT.sectionGap * s;
      ctx.fillStyle = "#4b5563";
      ctx.font = `${Math.round(LAYOUT.descFont * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      layout.description.forEach((line, idx) => {
        ctx.fillText(line, pad, y + idx * LAYOUT.descLineH * s);
      });
      y += layout.description.length * LAYOUT.descLineH * s;
    }

    // extra
    if (extra) {
      y += LAYOUT.sectionGap * s;
      ctx.fillStyle = THEME;
      ctx.font = `${Math.round(LAYOUT.extraFont * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      ctx.fillText(extra, pad, y);
      y += LAYOUT.extraLineH * s;
    }

    // subtasks
    if (!isNote && layout.subtasks.length > 0) {
      y += LAYOUT.sectionGap * s;
      layout.subtasks.forEach((sub) => {
        const done = sub.status === "completed" || sub.status === "done";

        ctx.fillStyle = done ? "#10b981" : "#d1d5db";
        ctx.beginPath();
        ctx.arc(pad + 10 * s, y + (LAYOUT.subtaskFont - 20) * s * 0.5 + 10 * s, 10 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = done ? "#6b7280" : "#374151";
        ctx.font = `${Math.round(LAYOUT.subtaskFont * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
        sub.lines.forEach((line, idx) => {
          ctx.fillText(line, pad + LAYOUT.subtaskBulletOffset * s, y + idx * LAYOUT.subtaskLineH * s);
        });
        y += sub.itemH * s;
      });
    }

    // separator
    y += LAYOUT.sectionGap * s;
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();

    // footer
    y += LAYOUT.separatorGap * s;

    ctx.fillStyle = "#111827";
    ctx.font = `${Math.round(LAYOUT.footerBrandFont * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText("心栈 SoulSentry", pad, y);

    ctx.fillStyle = "#9ca3af";
    ctx.font = `${Math.round(LAYOUT.footerTipFont * s)}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillText("扫码查看 · 评论 · 参与", pad, y + (LAYOUT.footerBrandFont + LAYOUT.footerTipGap) * s);

    const qrSize = LAYOUT.qrSize * s;
    const qrX = W - pad - qrSize;
    const qrY = y;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX - 8 * s, qrY - 8 * s, qrSize + 16 * s, qrSize + 16 * s);

    if (link) {
      drawQRCode(ctx, link, qrX, qrY, qrSize);
    }
  };

  const savePoster = () => {
    if (!posterUrl) {
      generatePoster();
      return;
    }
    Taro.saveImageToPhotosAlbum({
      filePath: posterUrl,
      success: () => Taro.showToast({ title: "已保存到相册", icon: "success" }),
      fail: (err) => {
        if (err.errMsg?.includes("auth deny")) {
          Taro.showModal({
            title: "需要授权",
            content: "请允许保存图片到相册",
            showCancel: false
          });
        }
      }
    });
  };

  const copyLink = () => {
    if (!link) return;
    Taro.setClipboardData({
      data: link,
      success: () => Taro.showToast({ title: "分享链接已复制", icon: "success" })
    });
  };

  if (!visible) return null;

  const { width: W, height: H } = canvasSize;

  return (
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 1000,
        padding: "5%"
      }}
      onClick={onClose}
    >
      {/* 图片可滚动区域 */}
      <View
        style={{
          width: "100%",
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <View style={{ width: "100%", display: "flex", justifyContent: "center", padding: "24rpx 0" }}>
          {posterUrl ? (
            <Image
              src={posterUrl}
              style={{
                width: `${W}px`,
                height: `${H}px`,
                borderRadius: "20rpx",
                boxShadow: "0 16rpx 60rpx rgba(0,0,0,0.25)",
                background: "#ffffff"
              }}
              mode="scaleToFill"
            />
          ) : (
            <View
              style={{
                width: `${W}px`,
                height: "400rpx",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ffffff",
                borderRadius: "20rpx",
                boxShadow: "0 16rpx 60rpx rgba(0,0,0,0.25)"
              }}
            >
              <Text style={{ color: "#666", fontSize: "28rpx" }}>生成中...</Text>
            </View>
          )}
        </View>

        {generating && !posterUrl && (
          <View style={{ textAlign: "center", marginTop: "24rpx" }}>
            <Text style={{ color: "#fff", fontSize: "28rpx" }}>卡片生成中...</Text>
          </View>
        )}
      </View>

      {/* 底部按钮 */}
      <View style={{ width: "100%", paddingTop: "24rpx" }} onClick={(e) => e.stopPropagation()}>
        <Button className="ss-btn" onClick={savePoster} disabled={generating || !posterUrl}>
          保存到相册
        </Button>
        <Button className="ss-btn ss-btn-plain" onClick={copyLink} disabled={generating || !posterUrl}>
          复制链接
        </Button>
        <Button className="ss-btn ss-btn-plain" onClick={onClose}>
          关闭
        </Button>
      </View>
    </View>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function roundRectTop(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
