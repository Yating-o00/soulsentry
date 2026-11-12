import React from "react";
import { View, Text } from "@tarojs/components";
import theme from "@/components/tasks/theme";

// AI 徽章(原 flow/tasks/notes/task-create 各定义一份,统一于此)
export default function AiBadge({ text = "AI 生成" }) {
  return (
    <View style={{ display: "flex", alignItems: "center" }}>
      <View
        style={{
          padding: "2rpx 10rpx",
          borderRadius: "8rpx",
          background: "rgba(91,130,160,0.10)",
          display: "flex",
          alignItems: "center"
        }}
      >
        <Text style={{ fontSize: "18rpx", color: theme.water, fontWeight: 500 }}>{text}</Text>
      </View>
    </View>
  );
}
