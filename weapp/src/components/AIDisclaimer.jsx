import React from "react";
import { View, Text } from "@tarojs/components";
import theme from "@/components/tasks/theme";

// AI 内容免责声明(原 5 页各自复制,统一于此)
export default function AIDisclaimer({ text = "部分内容由 AI 生成，仅供参考。重要决策请结合自身判断。" }) {
  return (
    <View
      style={{
        margin: "0 0 24rpx",
        padding: "18rpx 22rpx",
        borderRadius: "14rpx",
        background: "rgba(91,130,160,0.06)",
        border: "1rpx solid rgba(91,130,160,0.12)",
        display: "flex",
        alignItems: "center"
      }}
    >
      <View
        style={{
          width: "28rpx",
          height: "28rpx",
          borderRadius: "50%",
          background: theme.water,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: "14rpx",
          flexShrink: 0
        }}
      >
        <Text style={{ fontSize: "16rpx", color: "#fff", fontWeight: 600 }}>AI</Text>
      </View>
      <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, lineHeight: "38rpx" }}>{text}</Text>
    </View>
  );
}
