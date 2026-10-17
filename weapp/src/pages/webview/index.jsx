import Taro, { useLoad } from "@tarojs/taro";
import { WebView, View, Text, Button } from "@tarojs/components";
import { useState } from "react";

export default function WebviewPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useLoad(() => {
    const params = Taro.getCurrentInstance().router.params || {};
    const targetUrl = decodeURIComponent(params.url || "");
    if (!targetUrl || !targetUrl.startsWith("http")) {
      setError("链接地址无效或为空");
      return;
    }
    setUrl(targetUrl);
  });

  const copyUrl = async () => {
    try {
      await Taro.setClipboardData({ data: url || "" });
      Taro.showToast({ title: "链接已复制", icon: "success" });
    } catch (err) {
      Taro.showToast({ title: "复制失败", icon: "none" });
    }
  };

  if (error) {
    return (
      <View style={{ padding: "60rpx 40rpx", textAlign: "center" }}>
        <Text style={{ fontSize: "30rpx", color: "#666", lineHeight: "48rpx" }}>{error}</Text>
        {url ? (
          <Button style={{ marginTop: "40rpx" }} onClick={copyUrl}>
            复制链接
          </Button>
        ) : null}
      </View>
    );
  }

  return <WebView src={url} onError={() => setError("页面加载失败，请复制到浏览器打开")} />;
}
