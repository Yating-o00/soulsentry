import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import useAuth from "@/hooks/useAuth";

export default function Account() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <View className="ss-page">
        <View className="ss-empty">加载中...</View>
      </View>
    );
  }

  if (!user) {
    return (
      <View className="ss-page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: "32rpx", color: "#666", marginBottom: "40rpx" }}>登录后查看个人中心</Text>
        <Button className="ss-btn" style={{ width: "560rpx" }} onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}>
          登录 / 注册
        </Button>
      </View>
    );
  }

  return (
    <View className="ss-page">
      <View className="ss-card" style={{ textAlign: "center", paddingTop: "48rpx", paddingBottom: "48rpx" }}>
        <View
          style={{
            width: "120rpx",
            height: "120rpx",
            borderRadius: "50%",
            background: "#384877",
            color: "#fff",
            lineHeight: "120rpx",
            fontSize: "48rpx",
            margin: "0 auto 24rpx"
          }}
        >
          {(user.display_name || user.full_name || "我").charAt(0)}
        </View>
        <View className="ss-title" style={{ marginBottom: "8rpx" }}>
          {user.display_name || user.full_name || "未设置称呼"}
        </View>
        {user.phone ? <Text className="ss-muted">手机号：{user.phone}</Text> : null}
        {user.email ? (
          <View style={{ marginTop: "8rpx" }}>
            <Text className="ss-muted">邮箱：{user.email}</Text>
          </View>
        ) : null}
      </View>

      <Button className="ss-btn ss-btn-danger" onClick={logout}>
        退出登录
      </Button>
    </View>
  );
}
