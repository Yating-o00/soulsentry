import React from "react";
import { View, Text } from "@tarojs/components";
import theme from "@/components/tasks/theme";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "凌晨好";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

const dateLabel = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
});

// 问候头部(原 flow/tasks/notes 三页各复制一份问候代码,统一于此)
// eyebrow: 眉题小字(如"心栈 · 流");sub: 主题句;showDate: 是否显示日期行
// compact: 心流页头部的紧凑双行形态——眉题一行、问候+主题句一行小字，不喧宾夺主
export default function GreetingHeader({ eyebrow, sub, showDate = true, compact = false }) {
  if (compact) {
    return (
      <View>
        {eyebrow && (
          <View>
            <Text style={{ fontSize: "32rpx", fontWeight: 500, color: theme.ink }}>{eyebrow}</Text>
          </View>
        )}
        <View style={{ marginTop: "-4rpx" }}>
          <Text style={{ fontSize: "20rpx", color: theme.inkQuaternary }}>
            {greeting()}{sub ? `，${sub}` : "。"}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View>
      {showDate && (
        <View>
          <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "4rpx" }}>{dateLabel}</Text>
        </View>
      )}
      {eyebrow && (
        <View style={{ marginTop: showDate ? "16rpx" : 0 }}>
          <Text style={{ fontSize: "24rpx", color: theme.inkTertiary }}>{eyebrow}</Text>
        </View>
      )}
      <View style={{ marginTop: showDate || eyebrow ? "16rpx" : 0 }}>
        <Text style={{ fontSize: "52rpx", fontWeight: 700, color: theme.primary, lineHeight: "72rpx" }}>
          {greeting()}。
        </Text>
      </View>
      {sub && (
        <View style={{ marginTop: "24rpx" }}>
          <Text style={{ fontSize: "40rpx", fontWeight: 500, color: theme.inkSecondary, lineHeight: "56rpx" }}>
            {sub}
          </Text>
        </View>
      )}
    </View>
  );
}
