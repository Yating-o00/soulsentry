import { View, Text } from "@tarojs/components";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";

/**
 * 大圆麦克风（语音弹层用）：按住说话、松手识别。
 * 识别结果通过 onResult 交给业务方（只回调，不自动发送）。
 */
export default function VoiceInput({
  onResult,
  onError,
  onTouchStart: onTouchStartProp,
  size = 96,
  style = {}
}) {
  const { hint, recording, start, stop } = useVoiceRecognition({ onResult, onError });

  return (
    <View style={{ display: "flex", flexDirection: "column", alignItems: "center", ...style }}>
      <View
        onTouchStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTouchStartProp?.();
          start();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          stop();
        }}
        onTouchCancel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          stop();
        }}
        style={{
          width: `${size}rpx`,
          height: `${size}rpx`,
          borderRadius: "50%",
          background: recording
            ? "linear-gradient(135deg, #e53935 0%, #ff6b6b 100%)"
            : "linear-gradient(135deg, #384877 0%, #4a5d8f 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: recording
            ? "0 0 0 12rpx rgba(229, 57, 53, 0.25)"
            : "0 8rpx 24rpx rgba(56, 72, 119, 0.25)",
          transition: "all 0.2s ease"
        }}
      >
        <Text style={{ fontSize: `${Math.round(size * 0.45)}rpx`, color: "#ffffff" }}>
          {recording ? "🎙️" : "🎤"}
        </Text>
      </View>
      {hint ? (
        <Text
          style={{
            marginTop: "16rpx",
            fontSize: "26rpx",
            color: recording ? "#e53935" : "#666666",
            textAlign: "center",
            maxWidth: "560rpx"
          }}
        >
          {hint}
        </Text>
      ) : (
        <Text style={{ marginTop: "16rpx", fontSize: "26rpx", color: "#999999" }}>
          按住说话
        </Text>
      )}
    </View>
  );
}
