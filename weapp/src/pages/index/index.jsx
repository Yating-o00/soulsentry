import { useEffect } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { isLoggedIn } from "@/utils/auth";

export default function Index() {
  useEffect(() => {
    if (isLoggedIn()) {
      Taro.switchTab({ url: "/pages/flow/index" });
    }
  }, []);

  const goBrowse = () => {
    Taro.switchTab({ url: "/pages/flow/index" });
  };

  const goLogin = () => {
    Taro.navigateTo({ url: "/pages/login/index" });
  };

  return (
    <View className="ss-page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <View style={{ textAlign: "center", marginBottom: "60rpx" }}>
        <Text style={{ fontSize: "72rpx", fontWeight: 700, color: "#384877" }}>SoulSentry</Text>
        <View style={{ marginTop: "24rpx" }}>
          <Text style={{ fontSize: "32rpx", color: "#666666" }}>守护每一个约定</Text>
        </View>
        <View style={{ marginTop: "16rpx" }}>
          <Text style={{ fontSize: "26rpx", color: "#999999" }}>先逛逛，再决定是否留下</Text>
        </View>
      </View>

      <Button className="ss-btn" style={{ width: "560rpx", marginBottom: "24rpx" }} onClick={goBrowse}>
        立即体验
      </Button>
      <Button className="ss-btn ss-btn-plain" style={{ width: "560rpx" }} onClick={goLogin}>
        登录 / 注册
      </Button>
    </View>
  );
}
