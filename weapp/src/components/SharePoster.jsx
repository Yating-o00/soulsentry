import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Image } from "@tarojs/components";
import createQRCode from "@/lib/qrcode";

const BASE_WIDTH = 640;
const THEME = "#384877";
const THEME_LIGHT = "#3b5aa2";

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
  const chars = String(text || "").split("");
  const lines = [];
  let line = "";

  // 部分环境下 Canvas 2D 字体未就绪时 measureText 会返回 0，
  // 此时按当前字体大小估算中文字符宽度作为 fallback。
  const probeWidth = ctx.measureText("中").width;
  const fontSize = parseInt(ctx.font) || 26;
  const fallbackCharWidth = probeWidth > 0 ? 0 : fontSize;

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

export default function SharePoster({ visible, onClose, type, title, description, extra, subtasks = [], shareToken, canvasId }) {
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
