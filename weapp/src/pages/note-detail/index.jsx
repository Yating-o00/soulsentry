import { useState, useEffect } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Input, Button, ScrollView } from "@tarojs/components";
import { get, post } from "@/utils/api";

export default function NoteDetail() {
  const [note, setNote] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);

  const noteId = Taro.getCurrentInstance().router.params.id;

  const fetchAll = async () => {
    if (!noteId) return;
    setLoading(true);
    try {
      const noteData = await get(`/notes/${noteId}`);
      setNote(noteData);

      const cmt = await get("/note-comments", { note_id: noteId, sort: "-created_date", limit: 100 });
      setComments(Array.isArray(cmt) ? cmt : []);
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    fetchAll();
  });

  useEffect(() => {
    fetchAll();
  }, [noteId]);

  const submitComment = async () => {
    if (!commentText.trim()) {
      Taro.showToast({ title: "请输入评论内容", icon: "none" });
      return;
    }
    try {
      await post("/note-comments", { note_id: noteId, content: commentText.trim() });
      setCommentText("");
      fetchAll();
    } catch (err) {
      // handled globally
    }
  };

  if (loading && !note) {
    return (
      <View className="ss-page">
        <View className="ss-empty">加载中...</View>
      </View>
    );
  }

  if (!note) {
    return (
      <View className="ss-page">
        <View className="ss-empty">心签不存在或已删除</View>
      </View>
    );
  }

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        <View className="ss-card">
          <View className="ss-title">{note.title || "未命名心签"}</View>
          <View style={{ marginTop: "20rpx" }}>
            <Text style={{ fontSize: "30rpx", color: "#333", lineHeight: "52rpx" }}>{note.content}</Text>
          </View>
        </View>

        <View className="ss-card">
          <View className="ss-section-title">评论</View>
          {comments.length === 0 && <View className="ss-empty">暂无评论</View>}
          {comments.map((c) => (
            <View key={c.id} style={{ marginBottom: "20rpx", paddingBottom: "20rpx", borderBottom: "1rpx solid #e5e6eb" }}>
              <View style={{ display: "flex", justifyContent: "space-between", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "28rpx", color: "#384877", fontWeight: 500 }}>{c.created_by || c.visitor_name || "访客"}</Text>
                <Text className="ss-muted">{new Date(c.created_date).toLocaleString("zh-CN")}</Text>
              </View>
              <Text style={{ fontSize: "30rpx", color: "#333" }}>{c.content}</Text>
            </View>
          ))}
        </View>

        <View className="ss-card">
          <View className="ss-section-title">发表评论</View>
          <Input
            className="ss-input"
            placeholder="写下你的评论"
            value={commentText}
            onInput={(e) => setCommentText(e.detail.value)}
          />
          <Button className="ss-btn" onClick={submitComment}>发送</Button>
        </View>

        <View style={{ height: "40rpx" }} />
      </ScrollView>
    </View>
  );
}
