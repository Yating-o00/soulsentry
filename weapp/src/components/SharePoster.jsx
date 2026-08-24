import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Canvas, Image } from "@tarojs/components";
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
  headerGap: 36, // header 底部到 title 顶部的间距
  titleFont: 36,
  titleFontLong: 30,
  titleLineH: 64, // 36 + 28
  titleLineHLong: 54, // 30 + 24
  titleMaxLines: 4,
  descFont: 26,
  descLineH: 54, // 26 + 28
  descMaxLines: 6,
  extraFont: 22,
  extraLineH: 46, // 22 + 24
  subtaskFont: 24,
  subtaskLineH: 52, // 24 + 28
  subtaskBulletOffset: 32,
  subtaskGap: 20,
  subtaskMaxLines: 2,
  subtaskMaxCount: 8,
  sectionGap: 32, // 两个 section 之间的间距
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
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
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
          ctx.setFillStyle("#1f2937");
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

  // header
  y += headerFont + headerGap;

  // title
  const titleText = String(title || "未命名").trim();
  const useLongTitle = titleText.length > 40;
  const titleFontSize = useLongTitle ? titleFontLong : titleFont;
  const titleLineHeight = useLongTitle ? titleLineHLong : titleLineH;
  ctx.setFontSize(titleFontSize);
  const titleLines = wrapText(ctx, titleText, BASE_WIDTH - pad * 2).slice(0, titleMaxLines);
  y += titleLines.length * titleLineHeight;
  const titleMeta = { text: titleText, lines: titleLines, fontSize: titleFontSize, lineHeight: titleLineHeight };

  // description
  let descLines = [];
  if (description) {
    y += sectionGap;
    ctx.setFontSize(descFont);
    // 心签内容通常较长，允许显示更多行
    const noteDescMaxLines = isNote ? 30 : descMaxLines;
    descLines = wrapText(ctx, String(description).trim(), BASE_WIDTH - pad * 2).slice(0, noteDescMaxLines);
    y += descLines.length * descLineH;
  }

  // extra
  if (extra) {
    y += sectionGap;
    y += extraLineH;
  }

  // subtasks
  let subtaskMeta = [];
  if (!isNote && subtasks && subtasks.length > 0) {
    y += sectionGap;
    const visibleSubtasks = subtasks.slice(0, subtaskMaxCount);
    visibleSubtasks.forEach((sub) => {
      ctx.setFontSize(subtaskFont);
      const lines = wrapText(ctx, sub.title, BASE_WIDTH - pad * 2 - subtaskBulletOffset).slice(0, subtaskMaxLines);
      const itemH = Math.max(lines.length * subtaskLineH + subtaskGap, 56);
      subtaskMeta.push({ ...sub, lines, itemH });
      y += itemH;
    });
  }

  // separator + footer
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

    // 使用 nextTick 确保 canvas 元素已渲染
    Taro.nextTick(() => {
      generatePoster();
    });
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

      const ctx = Taro.createCanvasContext(canvasId);
      const layout = measureLayout(ctx, title, description, extra, subtasks, isNote);
      const heightPx = Math.round(widthPx * (layout.totalHeight / BASE_WIDTH));

      setCanvasSize({ width: widthPx, height: heightPx });

      // 等待 React 更新 Canvas 元素尺寸后再绘制
      setTimeout(() => {
        try {
          const ctx2 = Taro.createCanvasContext(canvasId);
          drawPoster(ctx2, widthPx, heightPx, layout);
        } catch (err) {
          console.error("draw poster failed", err);
          setGenerating(false);
          generatingRef.current = false;
        }
      }, 200);
    } catch (err) {
      console.error("generate poster failed", err);
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  const drawPoster = (ctx, W, H, layout) => {
    const s = W / BASE_WIDTH;
    const pad = LAYOUT.pad * s;

    // 统一使用 top baseline，y 即元素顶部
    ctx.setTextBaseline("top");

    // 清空画布
    ctx.clearRect(0, 0, W, H);

    // 白底圆角卡片
    ctx.setFillStyle("#ffffff");
    roundRect(ctx, 0, 0, W, H, 20 * s);
    ctx.fill();

    // 顶部主题条
    const grd = ctx.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, THEME);
    grd.addColorStop(1, THEME_LIGHT);
    ctx.setFillStyle(grd);
    roundRectTop(ctx, 0, 0, W, LAYOUT.topBarH * s, 20 * s);
    ctx.fill();

    let y = pad + LAYOUT.topBarH * s;

    // header：类型 + 日期 + 完成度
    ctx.setFillStyle(THEME);
    ctx.setFontSize(Math.round(LAYOUT.headerFont * s));
    ctx.fillText(isNote ? "心签" : "约定", pad, y);

    const dateStr = formatDateTime(new Date().toISOString());
    ctx.setFillStyle("#9ca3af");
    ctx.setFontSize(Math.round(20 * s));
    const dateWidth = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, W - pad - dateWidth, y + (LAYOUT.headerFont - 20) * s * 0.5);

    if (!isNote) {
      const doneCount = (subtasks || []).filter((t) => t.status === "completed" || t.status === "done").length;
      const total = (subtasks || []).length;
      const statusText = total > 0 ? `完成 ${doneCount}/${total}` : "进行中";
      ctx.setFillStyle(doneCount === total && total > 0 ? "#10b981" : THEME);
      ctx.setFontSize(Math.round(20 * s));
      const statusWidth = ctx.measureText(statusText).width;
      ctx.fillText(statusText, W - pad - dateWidth - statusWidth - 20 * s, y + (LAYOUT.headerFont - 20) * s * 0.5);
    }

    y += (LAYOUT.headerFont + LAYOUT.headerGap) * s;

    // title
    const { title: titleMeta } = layout;
    ctx.setFillStyle("#111827");
    ctx.setFontSize(Math.round(titleMeta.fontSize * s));
    titleMeta.lines.forEach((line, idx) => {
      ctx.fillText(line, pad, y + idx * titleMeta.lineHeight * s);
    });
    y += titleMeta.lines.length * titleMeta.lineHeight * s;

    // description
    if (layout.description.length > 0) {
      y += LAYOUT.sectionGap * s;
      ctx.setFillStyle("#4b5563");
      ctx.setFontSize(Math.round(LAYOUT.descFont * s));
      layout.description.forEach((line, idx) => {
        ctx.fillText(line, pad, y + idx * LAYOUT.descLineH * s);
      });
      y += layout.description.length * LAYOUT.descLineH * s;
    }

    // extra
    if (extra) {
      y += LAYOUT.sectionGap * s;
      ctx.setFillStyle(THEME);
      ctx.setFontSize(Math.round(LAYOUT.extraFont * s));
      ctx.fillText(extra, pad, y);
      y += LAYOUT.extraLineH * s;
    }

    // subtasks
    if (!isNote && layout.subtasks.length > 0) {
      y += LAYOUT.sectionGap * s;
      layout.subtasks.forEach((sub) => {
        const done = sub.status === "completed" || sub.status === "done";

        // 圆点与第一行文字垂直居中
        ctx.setFillStyle(done ? "#10b981" : "#d1d5db");
        ctx.beginPath();
        ctx.arc(pad + 10 * s, y + (LAYOUT.subtaskFont - 20) * s * 0.5 + 10 * s, 10 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.setFillStyle(done ? "#6b7280" : "#374151");
        ctx.setFontSize(Math.round(LAYOUT.subtaskFont * s));
        sub.lines.forEach((line, idx) => {
          ctx.fillText(line, pad + LAYOUT.subtaskBulletOffset * s, y + idx * LAYOUT.subtaskLineH * s);
        });
        y += sub.itemH * s;
      });
    }

    // separator
    y += LAYOUT.sectionGap * s;
    ctx.setStrokeStyle("rgba(0,0,0,0.06)");
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();

    // footer
    y += LAYOUT.separatorGap * s;

    ctx.setFillStyle("#111827");
    ctx.setFontSize(Math.round(LAYOUT.footerBrandFont * s));
    ctx.fillText("心栈 SoulSentry", pad, y);

    ctx.setFillStyle("#9ca3af");
    ctx.setFontSize(Math.round(LAYOUT.footerTipFont * s));
    ctx.fillText("扫码查看 · 评论 · 参与", pad, y + (LAYOUT.footerBrandFont + LAYOUT.footerTipGap) * s);

    const qrSize = LAYOUT.qrSize * s;
    const qrX = W - pad - qrSize;
    const qrY = y;

    ctx.setFillStyle("#ffffff");
    ctx.fillRect(qrX - 8 * s, qrY - 8 * s, qrSize + 16 * s, qrSize + 16 * s);

    if (link) {
      drawQRCode(ctx, link, qrX, qrY, qrSize);
    }

    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId,
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
    });
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
        justifyContent: "center",
        zIndex: 1000,
        padding: "5%"
      }}
      onClick={onClose}
    >
      <View
        style={{
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 显示区域：生成完成后展示图片，高度自然随内容变化 */}
        <View style={{ width: "100%", display: "flex", justifyContent: "center", position: "relative" }}>
          {/* 隐藏 Canvas 用于绘制，放在图片/loading 下方 */}
          <Canvas
            canvasId={canvasId}
            style={{
              position: "absolute",
              top: 0,
              left: `${(100 - 90) / 2}%`,
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              visibility: "hidden",
              zIndex: 1
            }}
          />

          {posterUrl ? (
            <Image
              src={posterUrl}
              mode="widthFix"
              style={{
                width: `${canvasSize.width}px`,
                borderRadius: "20rpx",
                boxShadow: "0 16rpx 60rpx rgba(0,0,0,0.25)",
                background: "#ffffff",
                position: "relative",
                zIndex: 2
              }}
            />
          ) : (
            <View
              style={{
                width: `${canvasSize.width}px`,
                height: "400rpx",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ffffff",
                borderRadius: "20rpx",
                boxShadow: "0 16rpx 60rpx rgba(0,0,0,0.25)",
                position: "relative",
                zIndex: 2
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

        <View style={{ marginTop: "32rpx" }}>
          <Button className="ss-btn" onClick={savePoster} disabled={generating && !posterUrl}>
            保存到相册
          </Button>
          <Button className="ss-btn ss-btn-plain" onClick={copyLink} disabled={generating && !posterUrl}>
            复制链接
          </Button>
          <Button className="ss-btn ss-btn-plain" onClick={onClose}>
            关闭
          </Button>
        </View>
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
