import { useEffect } from "react";
import Taro from "@tarojs/taro";
import { View, Text } from "@tarojs/components";

// 启动页：不做登录拦截，直接进入「心流」首页（游客可逛全部功能，触发写操作再引导登录）
export default function Index() {
  useEffect(() => {
    Taro.switchTab({ url: "/pages/flow/index" });
  }, []);

  return (
    <View
      className="ss-page"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: "64rpx", fontWeight: 700, color: "#384877" }}>心栈</Text>
      <Text style={{ fontSize: "26rpx", color: "#999999", marginTop: "16rpx" }}>说给另一个自己听</Text>
    </View>
  );
}
