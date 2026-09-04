import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Textarea, Button } from "@tarojs/components";
import { post } from "@/utils/api";
import VoiceInput from "@/components/VoiceInput";

const THEME = {
  bg: "#ece4d9",
  surface: "#f4f0ea",
  card: "#fffbf5",
  ink: "#4f483e",
  inkStrong: "#3a352c",
  muted: "#8a7d6b",
  accent: "#f54001",
  tint: "#ffc198",
  line: "rgba(79,72,62,.14)"
};

export default function NoteCreate() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceErrorCount, setVoiceErrorCount] = useState(0);

  useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {};
    const preset = params.preset;
    if (preset) {
      setContent(decodeURIComponent(preset));
    }
  }, []);

  const submit = async () => {
    const text = content.trim();
    if (!text) {
      Taro.showToast({ title: "请输入心签内容", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const note = await post("/notes", {
        content: text,
        plain_text: text,
        source_type: "emotion"
      });

      // 立即触发分析；后端 5 秒内返回（Kimi 或本地兜底）
      post("/functions/analyzeHeartSign", {
        note_id: note.id,
        note_data: { plain_text: text, content: text }
      }, { silent: true }).catch((err) => {
        console.error("analyzeHeartSign silent failed", err);
      });

      Taro.showToast({ title: "心签已保存", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 600);
    } catch (err) {
      Taro.showToast({ title: "保存失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const insertLink = () => {
    setContent((prev) => (prev ? prev + " https://" : "https://"));
  };

  const handleVoiceResult = (text) => {
    setContent((prev) => (prev ? prev + " " + text : text));
    setVoiceErrorCount(0);
  };

  const handleVoiceError = (err) => {
    setVoiceErrorCount((c) => c + 1);
    if (voiceErrorCount >= 1) {
      Taro.showModal({
        title: "语音输入提示",
        content: "当前语音服务不太稳定，建议直接输入文字。如果一直无法使用，请检查微信公众平台「WechatSI」插件是否已添加。",
        showCancel: false
      });
    }
  };

  return (
    <View style={{ minHeight: "100vh", background: THEME.bg, display: "flex", flexDirection: "column" }}>
      {/* header */}
      <View
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24rpx 28rpx",
          borderBottom: `1rpx solid ${THEME.line}`,
          background: "rgba(236,228,217,.85)"
        }}
      >
        <View onClick={() => Taro.navigateBack()}>
          <Text style={{ fontSize: "30rpx", color: THEME.inkStrong }}>✕</Text>
        </View>
        <Text style={{ fontSize: "32rpx", fontWeight: 700, color: THEME.inkStrong }}>心签</Text>
        <Button
          size="mini"
          loading={loading}
          disabled={!content.trim() || loading}
          onClick={submit}
          style={{
            margin: 0,
            padding: "0 24rpx",
            height: "56rpx",
            lineHeight: "56rpx",
            background: content.trim() && !loading ? THEME.accent : "#d4cdc2",
            color: "#fffbf5",
            borderRadius: "999rpx",
            fontSize: "26rpx"
          }}
        >
          发送
        </Button>
      </View>

      {/* hint */}
      <View style={{ padding: "20rpx 28rpx" }}>
        <Text style={{ fontSize: "22rpx", color: THEME.muted }}>发给自己 —— 什么都可以说……</Text>
      </View>

      {/* textarea */}
      <View style={{ flex: 1, padding: "0 28rpx" }}>
        <Textarea
          style={{
            width: "100%",
            minHeight: "480rpx",
            background: THEME.card,
            borderRadius: "18rpx",
            padding: "28rpx",
            fontSize: "32rpx",
            color: THEME.inkStrong,
            lineHeight: "54rpx",
            boxSizing: "border-box"
          }}
          placeholder="此刻的心情、刷到的好文章、怕忘的号码、想分享的瞬间……"
          value={content}
          maxlength={2000}
          autoHeight
          disableDefaultPadding
          showConfirmBar={false}
          onInput={(e) => setContent(e.detail.value)}
          onConfirm={submit}
        />
      </View>

      {/* tools */}
      <View
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16rpx",
          padding: "20rpx 28rpx 48rpx",
          borderTop: `1rpx solid ${THEME.line}`,
          background: "rgba(236,228,217,.88)"
        }}
      >
        <View
          onClick={insertLink}
          style={{
            width: "64rpx",
            height: "64rpx",
            borderRadius: "16rpx",
            background: THEME.surface,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1rpx solid ${THEME.line}`
          }}
        >
          <Text style={{ fontSize: "30rpx", color: THEME.muted }}>🔗</Text>
        </View>
        <VoiceInput
          size={64}
          onResult={handleVoiceResult}
          onError={handleVoiceError}
        />
        <Text style={{ marginLeft: "auto", fontSize: "22rpx", color: THEME.muted }}>语音输入 · 链接 · 文字</Text>
      </View>
    </View>
  );
}
