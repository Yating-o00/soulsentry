import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import VoiceInput from "@/components/VoiceInput";
import { IconMic, IconArrowUp } from "./icons";
import theme from "./theme";

const suggestions = [
  "明天下午3点和林总过方案",
  "每周五晚上给爸妈打电话",
  "下班顺路去加油站加油",
  "周五前给张总发跟进邮件",
];

export default function Composer({ isGuest = false }) {
  const [value, setValue] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    if (isGuest) {
      Taro.navigateTo({ url: "/pages/login/index" });
      return;
    }
    Taro.navigateTo({
      url: `/pages/task-create/index?title=${encodeURIComponent(text)}`,
    });
  };

  const openVoice = () => {
    if (isGuest) {
      Taro.navigateTo({ url: "/pages/login/index" });
      return;
    }
    setVoiceOpen(true);
  };
  const closeVoice = () => setVoiceOpen(false);

  const handleVoiceResult = (text) => {
    if (text) setValue(text);
    closeVoice();
  };

  const handleVoiceError = (err) => {
    Taro.showToast({ title: err || "语音识别失败", icon: "none" });
  };

  const fillSuggestion = (s) => {
    setValue(s);
  };

  return (
    <View>
      <View
        style={{
          border: `1rpx solid ${theme.border}`,
          background: theme.card,
          borderRadius: "12rpx",
          padding: "24rpx",
          display: "flex",
          alignItems: "center",
          gap: "16rpx",
        }}
      >
        <Text style={{ fontSize: "40rpx", color: theme.inkQuaternary, lineHeight: "44rpx" }}>＋</Text>
        <Input
          value={value}
          onInput={(e) => setValue(e.detail.value)}
          placeholder="说出一个约定，剩下的交给心栈…"
          placeholderStyle={{ color: theme.inkQuaternary }}
          style={{
            flex: 1,
            fontSize: "32rpx",
            color: theme.ink,
            height: "48rpx",
            lineHeight: "48rpx",
          }}
        />
        <View
          onClick={openVoice}
          style={{
            padding: "12rpx",
            border: `1rpx solid ${voiceOpen ? theme.primary : "transparent"}`,
            borderRadius: "8rpx",
          }}
        >
          <IconMic size={36} color={voiceOpen ? theme.primary : theme.inkQuaternary} />
        </View>
        <Button
          onClick={submit}
          disabled={!value.trim()}
          style={{
            margin: 0,
            padding: "12rpx 28rpx",
            height: "auto",
            lineHeight: "40rpx",
            background: theme.primary,
            color: theme.paper,
            fontSize: "28rpx",
            letterSpacing: "4rpx",
            borderRadius: "8rpx",
            opacity: value.trim() ? 1 : 0.35,
          }}
        >
          <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
            <Text style={{ color: theme.paper, fontSize: "28rpx" }}>约定</Text>
            <IconArrowUp size={24} color={theme.paper} />
          </View>
        </Button>
      </View>

      <View style={{ marginTop: "20rpx", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16rpx 24rpx" }}>
        <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "4rpx" }}>试一试</Text>
        {suggestions.map((s) => (
          <Text
            key={s}
            onClick={() => fillSuggestion(s)}
            style={{
              fontSize: "24rpx",
              color: theme.inkSecondary,
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: theme.inkQuaternary,
            }}
          >
            {s}
          </Text>
        ))}
      </View>

      {voiceOpen && (
        <View
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(28, 28, 30, 0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={closeVoice}
        >
          <View
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: theme.card,
              borderTopLeftRadius: "24rpx",
              borderTopRightRadius: "24rpx",
              padding: "48rpx 32rpx 96rpx",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: "32rpx", fontWeight: 700, color: theme.ink, marginBottom: "12rpx" }}>
              按住说话
            </Text>
            <Text style={{ fontSize: "24rpx", color: theme.inkTertiary, marginBottom: "48rpx" }}>
              说出约定，松开即可填入输入框
            </Text>
            <VoiceInput
              size={128}
              onResult={handleVoiceResult}
              onError={handleVoiceError}
            />
            <Button
              onClick={closeVoice}
              style={{
                marginTop: "56rpx",
                width: "100%",
                height: "84rpx",
                lineHeight: "84rpx",
                background: theme.paper,
                color: theme.inkSecondary,
                fontSize: "28rpx",
                border: `1rpx solid ${theme.border}`,
                borderRadius: "12rpx",
              }}
            >
              取消
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
