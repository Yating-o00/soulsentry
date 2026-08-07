import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Input, Textarea, Button } from "@tarojs/components";
import { post } from "@/utils/api";

export default function NoteCreate() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!content.trim()) {
      Taro.showToast({ title: "请输入心签内容", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      await post("/notes", {
        title: title.trim() || undefined,
        content: content.trim()
      });
      Taro.showToast({ title: "创建成功", icon: "success" });
      setTimeout(() => {
        Taro.navigateBack();
      }, 500);
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="ss-page">
      <View className="ss-card">
        <View className="ss-title">新建心签</View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">标题</View>
          <Input
            className="ss-input"
            placeholder="给心签起个名字（可选）"
            value={title}
            onInput={(e) => setTitle(e.detail.value)}
          />
        </View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">内容 *</View>
          <Textarea
            className="ss-textarea"
            placeholder="写下你的心签..."
            value={content}
            onInput={(e) => setContent(e.detail.value)}
          />
        </View>

        <Button className="ss-btn" loading={loading} disabled={loading} onClick={submit}>
          创建
        </Button>
      </View>
    </View>
  );
}
