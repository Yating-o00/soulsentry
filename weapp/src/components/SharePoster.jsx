import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Canvas } from "@tarojs/components";
import createQRCode from "@/lib/qrcode";

const BASE_WIDTH = 640;
const THEME = "#384877";
const THEME_LIGHT = "#3b5aa2";

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

export default function SharePoster({ visible, onClose, type, title, description, extra, subtasks = [], shareToken, canvasId }) {
  const [posterUrl, setPosterUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: BASE_WIDTH, height: 960 });

  const link = shareToken ? `https://www.xinzhan-soulsentry.cn/share/${shareToken}` : "";
  const isNote = type === "note";

  // 计算内容所需高度
  const computeBaseHeight = () => {
    const pad = 48;
    const headerH = 60;
    const titleH = 72;
    const descLineH = 38;
    const subtaskH = 42;
    const statusH = 60;
    const qrAreaH = 180;
    const bottomPad = 60;

    const ctx = Taro.createCanvasContext(canvasId);
    const titleFontSize = 36;
    ctx.setFontSize(titleFontSize);
    const titleLines = wrapText(ctx, String(title || "未命名"), BASE_WIDTH - pad * 2);

    let descLines = [];
    if (description) {
      ctx.setFontSize(26);
      descLines = wrapText(ctx, String(description), BASE_WIDTH - pad * 2);
    }

    const visibleSubtasks = (subtasks || []).slice(0, 8);
    const subtaskCount = visibleSubtasks.length;

    return (
      pad +
      headerH +
      titleLines.length * titleH +
      (descLines.length ? descLines.length * descLineH + 24 : 0) +
      (subtaskCount ? subtaskCount * subtaskH + 36 : 0) +
      statusH +
      qrAreaH +
      bottomPad
    );
  };

  useEffect(() => {
    try {
      const sys = Taro.getSystemInfoSync();
      const winWidth = sys.windowWidth || 375;
      const widthPx = Math.round(winWidth * 0.9);
      const baseHeight = computeBaseHeight();
      const heightPx = Math.round(widthPx * (baseHeight / BASE_WIDTH));
      setCanvasSize({ width: widthPx, height: heightPx });
    } catch {
      // 使用默认尺寸
    }
  }, [title, description, subtasks.length]);

  useEffect(() => {
    if (visible && shareToken && !posterUrl && canvasSize.height > 0) {
      generatePoster();
    }
  }, [visible, shareToken, posterUrl, canvasSize]);

  useEffect(() => {
    if (!visible) {
      setPosterUrl("");
    }
  }, [visible]);

  const generatePoster = () => {
    setGenerating(true);
    const ctx = Taro.createCanvasContext(canvasId);
    const { width: W, height: H } = canvasSize;
    const s = W / BASE_WIDTH;
    const pad = 48 * s;

    // 白底圆角卡片
    ctx.setFillStyle("#ffffff");
    roundRect(ctx, 0, 0, W, H, 20 * s);
    ctx.fill();

    // 顶部主题条
    const grd = ctx.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, THEME);
    grd.addColorStop(1, THEME_LIGHT);
    ctx.setFillStyle(grd);
    roundRectTop(ctx, 0, 0, W, 8 * s, 20 * s);
    ctx.fill();

    let y = pad + 8 * s;

    // 头部：类型 + 日期
    ctx.setFillStyle(THEME);
    ctx.setFontSize(Math.round(24 * s));
    ctx.fillText(isNote ? "心签" : "约定", pad, y);

    const dateStr = formatDateTime(new Date().toISOString());
    ctx.setFillStyle("#9ca3af");
    ctx.setFontSize(Math.round(20 * s));
    const dateWidth = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, W - pad - dateWidth, y);

    // 完成度（仅约定）
    if (!isNote) {
      const doneCount = (subtasks || []).filter((t) => t.status === "completed" || t.status === "done").length;
      const total = (subtasks || []).length;
      const statusText = total > 0 ? `完成 ${doneCount}/${total}` : "进行中";
      ctx.setFillStyle(doneCount === total && total > 0 ? "#10b981" : THEME);
      ctx.setFontSize(Math.round(20 * s));
      const statusWidth = ctx.measureText(statusText).width;
      ctx.fillText(statusText, W - pad - dateWidth - statusWidth - 20 * s, y);
    }

    y += 50 * s;

    // 标题
    const titleText = String(title || "未命名").trim();
    const titleFontSize = titleText.length > 40 ? Math.round(30 * s) : Math.round(36 * s);
    ctx.setFillStyle("#111827");
    ctx.setFontSize(titleFontSize);
    const titleLines = wrapText(ctx, titleText, BASE_WIDTH - 96);
    const titleLineHeight = titleFontSize * 1.45;
    titleLines.slice(0, 4).forEach((line, idx) => {
      ctx.fillText(line, pad, y + idx * titleLineHeight);
    });
    y += titleLines.length * titleLineHeight + 16 * s;

    // 描述
    if (description) {
      ctx.setFillStyle("#4b5563");
      ctx.setFontSize(Math.round(26 * s));
      const descLines = wrapText(ctx, String(description).trim(), BASE_WIDTH - 96);
      descLines.slice(0, 6).forEach((line, idx) => {
        ctx.fillText(line, pad, y + idx * 38 * s);
      });
      y += Math.min(descLines.length, 6) * 38 * s + 24 * s;
    }

    // 截止时间（约定）
    if (extra) {
      ctx.setFillStyle(THEME);
      ctx.setFontSize(Math.round(22 * s));
      ctx.fillText(extra, pad, y);
      y += 40 * s;
    }

    // 子约定（约定）
    if (!isNote && subtasks && subtasks.length > 0) {
      y += 12 * s;
      const visibleSubtasks = subtasks.slice(0, 8);
      visibleSubtasks.forEach((sub) => {
        const done = sub.status === "completed" || sub.status === "done";
        ctx.setFillStyle(done ? "#10b981" : "#d1d5db");
        ctx.beginPath();
        ctx.arc(pad + 10 * s, y - 8 * s, 10 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.setFillStyle(done ? "#6b7280" : "#374151");
        ctx.setFontSize(Math.round(24 * s));
        const subLines = wrapText(ctx, sub.title, BASE_WIDTH - 96 - 32 * s);
        subLines.slice(0, 2).forEach((line, idx) => {
          ctx.fillText(line, pad + 32 * s, y + idx * 34 * s);
        });
        y += Math.max(34 * Math.min(subLines.length, 2), 36 * s);
      });
      y += 20 * s;
    }

    // 分隔线
    ctx.setStrokeStyle("rgba(0,0,0,0.06)");
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();

    y += 36 * s;

    // 底部：品牌 + 扫码提示 + QR
    ctx.setFillStyle("#111827");
    ctx.setFontSize(Math.round(26 * s));
    ctx.fillText("心栈 SoulSentry", pad, y + 30 * s);

    ctx.setFillStyle("#9ca3af");
    ctx.setFontSize(Math.round(18 * s));
    ctx.fillText("扫码查看 · 评论 · 参与", pad, y + 58 * s);

    // QR 码
    const qrSize = 120 * s;
    const qrX = W - pad - qrSize;
    const qrY = y - 10 * s;

    // QR 白色背景
    ctx.setFillStyle("#ffffff");
    ctx.fillRect(qrX - 8 * s, qrY - 8 * s, qrSize + 16 * s, qrSize + 16 * s);

    if (link) {
      drawQRCode(ctx, link, qrX, qrY, qrSize);
    }

    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId,
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        success: (res) => {
          setPosterUrl(res.tempFilePath);
          setGenerating(false);
        },
        fail: () => {
          setGenerating(false);
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
          maxHeight: "84vh",
          overflowY: "auto"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Canvas
          canvasId={canvasId}
          style={{
            width: `${canvasSize.width}px`,
            height: `${canvasSize.height}px`,
            margin: "0 auto",
            borderRadius: "20rpx",
            boxShadow: "0 16rpx 60rpx rgba(0,0,0,0.25)",
            background: "#ffffff"
          }}
        />

        {generating && (
          <View style={{ textAlign: "center", marginTop: "24rpx" }}>
            <Text style={{ color: "#fff", fontSize: "28rpx" }}>生成中...</Text>
          </View>
        )}

        <View style={{ marginTop: "32rpx" }}>
          <Button className="ss-btn" onClick={savePoster} disabled={generating}>
            保存到相册
          </Button>
          <Button className="ss-btn ss-btn-plain" onClick={copyLink} disabled={generating}>
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
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
