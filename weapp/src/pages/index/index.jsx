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
      </View>

      <Button className="ss-btn" style={{ width: "560rpx" }} onClick={goLogin}>
        手机号登录
      </Button>
    </View>
  );
}
