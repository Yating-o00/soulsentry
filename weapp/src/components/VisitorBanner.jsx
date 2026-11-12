import React from "react";
import Taro from "@tarojs/taro";
import { View, Text } from "@tarojs/components";
import theme from "@/components/tasks/theme";

// 游客提示条(原 flow/tasks/notes 三页样式逐字复制,统一于此)
export default function VisitorBanner({
  text = "正在浏览演示数据，不是你的约定 · 登录后查看我的约定"
}) {
  return (
    <View
      onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
      style={{
        padding: "18rpx 24rpx",
        borderRadius: "12rpx",
        background: "#fff8e6",
        border: "1rpx solid #f5d78e",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}
    >
      <Text style={{ fontSize: "26rpx", color: "#8a6d3b" }}>{text}</Text>
      <Text style={{ fontSize: "24rpx", color: theme.primary, fontWeight: 500 }}>去登录 →</Text>
    </View>
  );
}
