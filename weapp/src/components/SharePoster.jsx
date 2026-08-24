import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Canvas } from "@tarojs/components";

const BASE_WIDTH = 600;
const BASE_HEIGHT = 880;
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

export default function SharePoster({ visible, onClose, type, title, description, extra, shareToken, canvasId }) {
  const [posterUrl, setPosterUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: BASE_WIDTH, height: BASE_HEIGHT });

  const link = shareToken ? `https://www.xinzhan-soulsentry.cn/share/${shareToken}` : "";
  const isNote = type === "note";

  useEffect(() => {
    try {
      const sys = Taro.getSystemInfoSync();
      const winWidth = sys.windowWidth || 375;
      const widthPx = Math.round(winWidth * 0.9);
      const heightPx = Math.round(widthPx * (BASE_HEIGHT / BASE_WIDTH));
      setCanvasSize({ width: widthPx, height: heightPx });
    } catch {
      // 使用默认尺寸
    }
  }, []);

  useEffect(() => {
    if (visible && shareToken && !posterUrl) {
      generatePoster();
    }
  }, [visible, shareToken, posterUrl, canvasSize.width, canvasSize.height]);

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

    // 卡片外框：圆角白底
    ctx.setFillStyle("#ffffff");
    roundRect(ctx, 0, 0, W, H, 20 * s);
    ctx.fill();

    // 顶部渐变细条
    const grd = ctx.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, THEME);
    grd.addColorStop(1, THEME_LIGHT);
    ctx.setFillStyle(grd);
    roundRectTop(ctx, 0, 0, W, 8 * s, 20 * s);
    ctx.fill();

    // 阴影/边框感：底部细线
    ctx.setStrokeStyle("rgba(0,0,0,0.04)");
    ctx.setLineWidth(1);
    roundRect(ctx, 0, 0, W, H, 20 * s);
    ctx.stroke();

    const pad = 44 * s;
    let y = 64 * s;

    // 头部：图标 + 类型 + 日期
    const iconGrd = ctx.createLinearGradient(pad, y - 24 * s, pad + 40 * s, y + 16 * s);
    iconGrd.addColorStop(0, THEME);
    iconGrd.addColorStop(1, THEME_LIGHT);
    ctx.setFillStyle(iconGrd);
    roundRect(ctx, pad, y - 24 * s, 40 * s, 40 * s, 10 * s);
    ctx.fill();

    ctx.setFillStyle("#ffffff");
    ctx.setFontSize(Math.round(22 * s));
    ctx.fillText(isNote ? "♥" : "✓", pad + 12 * s, y + 2 * s);

    ctx.setFillStyle(THEME);
    ctx.setFontSize(Math.round(26 * s));
    ctx.fillText(isNote ? "心签" : "约定", pad + 52 * s, y + 4 * s);

    const dateStr = formatDateTime(new Date().toISOString());
    ctx.setFillStyle("#9ca3af");
    ctx.setFontSize(Math.round(20 * s));
    const dateWidth = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, W - pad - dateWidth, y + 4 * s);

    // 装饰引号
    y += 56 * s;
    ctx.setFillStyle("rgba(56,72,119,0.12)");
    ctx.setFontSize(Math.round(48 * s));
    ctx.fillText("“", pad, y);

    // 主内容
    y += 28 * s;
    const content = String(title || description || "与你一起守护这份心意").trim();
    ctx.setFillStyle("#1f2937");
    const fontSize = content.length > 120 ? Math.round(30 * s) : content.length > 60 ? Math.round(32 * s) : Math.round(36 * s);
    ctx.setFontSize(fontSize);
    const lineHeight = fontSize * 1.7;
    const maxWidth = W - pad * 2;
    const lines = wrapText(ctx, content, maxWidth);
    lines.slice(0, 8).forEach((line, idx) => {
      ctx.fillText(line, pad, y + idx * lineHeight);
    });
    y += Math.min(lines.length, 8) * lineHeight + 24 * s;

    // 描述补充（如果是任务且标题和描述不同）
    if (!isNote && description && description !== title) {
      ctx.setFillStyle("#6b7280");
      ctx.setFontSize(Math.round(24 * s));
      const descLines = wrapText(ctx, description, maxWidth);
      descLines.slice(0, 3).forEach((line, idx) => {
        ctx.fillText(line, pad, y + idx * 38 * s);
      });
      y += Math.min(descLines.length, 3) * 38 * s + 24 * s;
    }

    // 分隔线
    y += 16 * s;
    ctx.setStrokeStyle("rgba(0,0,0,0.06)");
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();

    // 额外信息区
    y += 36 * s;
    ctx.setFillStyle("#6b7280");
    ctx.setFontSize(Math.round(24 * s));
    if (extra) {
      ctx.fillText(extra, pad, y);
      y += 40 * s;
    }

    // 互动入口提示
    ctx.setFillStyle(THEME);
    ctx.setFontSize(Math.round(24 * s));
    ctx.fillText(isNote ? "扫码或复制链接 · 留下你的回应" : "扫码或复制链接 · 参与并评论", pad, y);
    y += 40 * s;

    // 链接
    ctx.setFillStyle("#6b7280");
    ctx.setFontSize(Math.round(20 * s));
    const shortLink = link.length > 46 ? link.slice(0, 46) + "…" : link;
    ctx.fillText(shortLink, pad, y);

    // 底部品牌
    const bottomY = H - 56 * s;
    ctx.setFillStyle("#1f2937");
    ctx.setFontSize(Math.round(26 * s));
    ctx.fillText("心栈 SoulSentry", pad, bottomY);

    ctx.setFillStyle("#9ca3af");
    ctx.setFontSize(Math.round(18 * s));
    ctx.fillText("坚定守护，适时轻唤", pad, bottomY + 28 * s);

    // 右侧装饰圆点
    ctx.setFillStyle("rgba(56,72,119,0.08)");
    ctx.beginPath();
    ctx.arc(W - pad - 20 * s, bottomY - 10 * s, 28 * s, 0, Math.PI * 2);
    ctx.fill();

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
      <View style={{ width: "100%" }} onClick={(e) => e.stopPropagation()}>
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

// 绘制圆角矩形路径
function roundRect(ctx, x, y, w, h, r) {
  const min = Math.min(w, h);
  const radius = Math.min(r, min / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// 顶部圆角矩形
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

