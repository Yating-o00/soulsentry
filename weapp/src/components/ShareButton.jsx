import React from "react";
import { Button } from "@tarojs/components";

// 一键转发按钮：open-type="share" 触发微信原生转发面板（发送给朋友/群）。
// 可传 data-*（rest 展开），如 data-note-id / data-task-id，页面 onShareAppMessage 里从 options.target.dataset 读取。
export default function ShareButton({ text = "转发", theme, style = {}, ...rest }) {
  return (
    <Button
      openType="share"
      hoverClass="none"
      {...rest}
      style={{
        display: "inline-block",
        padding: "8rpx 16rpx",
        margin: 0,
        borderRadius: "10rpx",
        background: theme?.paper || "#faf8f4",
        border: `1rpx solid ${theme?.border || "#e8e3da"}`,
        fontSize: "22rpx",
        fontWeight: 400,
        color: theme?.inkTertiary || "#8a8578",
        lineHeight: "1.7",
        boxSizing: "border-box",
        ...style
      }}
    >
      {text}
    </Button>
  );
}
