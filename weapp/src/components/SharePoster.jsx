import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Canvas } from "@tarojs/components";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 840;

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

  const link = shareToken ? `https://www.xinzhan-soulsentry.cn/share/${shareToken}` : "";
  const displayTitle = String(title || "未命名").slice(0, 14);
  const displayDesc = String(description || "与你一起守护这份心意").slice(0, 60);

  useEffect(() => {
    if (visible && shareToken && !posterUrl) {
      generatePoster();
    }
  }, [visible, shareToken, posterUrl]);

  useEffect(() => {
    if (!visible) {
      setPosterUrl("");
    }
  }, [visible]);

  const generatePoster = () => {
    setGenerating(true);
    const ctx = Taro.createCanvasContext(canvasId);

    // 背景
    const grd = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grd.addColorStop(0, "#384877");
    grd.addColorStop(1, "#4a5d8f");
    ctx.setFillStyle(grd);
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 顶部品牌
    ctx.setFillStyle("#ffffff");
    ctx.setFontSize(28);
    ctx.fillText("SoulSentry", 40, 60);

    // 类型标签
    ctx.setFillStyle("rgba(255,255,255,0.9)");
    ctx.setFontSize(22);
    ctx.fillText(type === "note" ? "心签分享" : "约定分享", 40, 110);

    // 标题
    ctx.setFontSize(40);
    ctx.fillText(displayTitle, 40, 170);

    // 描述
    ctx.setFontSize(26);
    const descLines = wrapText(ctx, displayDesc, 520);
    descLines.slice(0, 4).forEach((line, idx) => {
      ctx.fillText(line, 40, 230 + idx * 40);
    });

    // 额外信息（截止时间等）
    if (extra) {
      ctx.setFontSize(24);
      ctx.fillText(extra, 40, 270 + Math.min(descLines.length, 4) * 40);
    }

    // 白色内容区
    ctx.setFillStyle("#ffffff");
    ctx.fillRect(40, 360, 520, 360);

    // 内容区文字
    ctx.setFillStyle("#384877");
    ctx.setFontSize(28);
    ctx.fillText(type === "note" ? "扫码查看心签" : "扫码参与约定", 70, 420);

    ctx.setFillStyle("#666666");
    ctx.setFontSize(22);
    ctx.fillText("对方可匿名查看、留言或勾选", 70, 460);

    // 链接
    ctx.setFillStyle("#384877");
    ctx.setFontSize(20);
    const shortLink = link.length > 48 ? link.slice(0, 48) + "…" : link;
    ctx.fillText(shortLink, 70, 640);

    // 底部提示
    ctx.setFillStyle("rgba(255,255,255,0.8)");
    ctx.setFontSize(22);
    ctx.fillText("长按识别 · 共同守护", 40, 800);

    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        destWidth: CANVAS_WIDTH,
        destHeight: CANVAS_HEIGHT,
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
        padding: "40rpx"
      }}
      onClick={onClose}
    >
      <View style={{ width: "100%", maxWidth: "600rpx" }} onClick={(e) => e.stopPropagation()}>
        <Canvas
          canvasId={canvasId}
          style={{
            width: "600rpx",
            height: "840rpx",
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
