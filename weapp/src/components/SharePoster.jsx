import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Canvas } from "@tarojs/components";

const BASE_WIDTH = 600;
const BASE_HEIGHT = 840;

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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

  useEffect(() => {
    try {
      const sys = Taro.getSystemInfoSync();
      const winWidth = sys.windowWidth || 375;
      // 卡片宽度占屏幕 90%，留出边距，高度按比例
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
    const scale = W / BASE_WIDTH;

    // 背景
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#384877");
    grd.addColorStop(1, "#4a5d8f");
    ctx.setFillStyle(grd);
    ctx.fillRect(0, 0, W, H);

    // 顶部品牌
    ctx.setFillStyle("#ffffff");
    ctx.setFontSize(Math.round(28 * scale));
    ctx.fillText("SoulSentry", 40 * scale, 60 * scale);

    // 类型标签
    ctx.setFillStyle("rgba(255,255,255,0.9)");
    ctx.setFontSize(Math.round(22 * scale));
    ctx.fillText(type === "note" ? "心签分享" : "约定分享", 40 * scale, 110 * scale);

    // 标题
    const displayTitle = String(title || "未命名").slice(0, 16);
    ctx.setFontSize(Math.round(40 * scale));
    ctx.fillText(displayTitle, 40 * scale, 170 * scale);

    // 描述
    const displayDesc = String(description || "与你一起守护这份心意").slice(0, 80);
    ctx.setFontSize(Math.round(26 * scale));
    const descLines = wrapText(ctx, displayDesc, 520 * scale);
    descLines.slice(0, 4).forEach((line, idx) => {
      ctx.fillText(line, 40 * scale, 230 * scale + idx * 40 * scale);
    });

    // 额外信息
    if (extra) {
      ctx.setFontSize(Math.round(24 * scale));
      ctx.fillText(extra, 40 * scale, 270 * scale + Math.min(descLines.length, 4) * 40 * scale);
    }

    // 白色内容区
    ctx.setFillStyle("#ffffff");
    ctx.fillRect(40 * scale, 360 * scale, 520 * scale, 360 * scale);

    // 内容区文字
    ctx.setFillStyle("#384877");
    ctx.setFontSize(Math.round(28 * scale));
    ctx.fillText(type === "note" ? "扫码查看心签" : "扫码参与约定", 70 * scale, 420 * scale);

    ctx.setFillStyle("#666666");
    ctx.setFontSize(Math.round(22 * scale));
    ctx.fillText("对方可匿名查看、留言或勾选", 70 * scale, 460 * scale);

    // 链接
    ctx.setFillStyle("#384877");
    ctx.setFontSize(Math.round(20 * scale));
    const shortLink = link.length > 48 ? link.slice(0, 48) + "…" : link;
    ctx.fillText(shortLink, 70 * scale, 640 * scale);

    // 底部提示
    ctx.setFillStyle("rgba(255,255,255,0.8)");
    ctx.setFontSize(Math.round(22 * scale));
    ctx.fillText("长按识别 · 共同守护", 40 * scale, 800 * scale);

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
        background: "rgba(0,0,0,0.7)",
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
            borderRadius: "16rpx",
            boxShadow: "0 8rpx 40rpx rgba(0,0,0,0.3)",
            background: "#384877"
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
