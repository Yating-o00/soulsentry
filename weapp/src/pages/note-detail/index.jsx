import { useState, useEffect } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Input, Textarea, Button, ScrollView } from "@tarojs/components";
import { get, post, patch } from "@/utils/api";
import RichText from "@/components/RichText";

export default function NoteDetail() {
  const [note, setNote] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

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

  const startEdit = () => {
    setEditTitle(note?.title || "");
    setEditContent(note?.content || "");
    setEditing(true);
  };

  const saveEdit = async () => {
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!content) {
      Taro.showToast({ title: "内容不能为空", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      const updated = await patch(`/notes/${noteId}`, { title, content, plain_text: content });
      setNote(updated);
      setEditing(false);
      Taro.showToast({ title: "已保存", icon: "success" });
    } catch (err) {
      // handled globally
    } finally {
      setSaving(false);
    }
  };

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
          <View style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <View className="ss-title" style={{ flex: 1 }}>{note.title || "未命名心签"}</View>
            {!editing ? (
              <Text
                style={{ fontSize: "26rpx", color: "#384877", padding: "8rpx 0 8rpx 24rpx", flexShrink: 0 }}
                onClick={startEdit}
              >
                编辑
              </Text>
            ) : (
              <View style={{ display: "flex", flexShrink: 0 }}>
                <Text
                  style={{ fontSize: "26rpx", color: "#86909c", padding: "8rpx 0 8rpx 24rpx" }}
                  onClick={() => setEditing(false)}
                >
                  取消
                </Text>
                <Text
                  style={{ fontSize: "26rpx", color: "#384877", fontWeight: 500, padding: "8rpx 0 8rpx 24rpx" }}
                  onClick={saveEdit}
                >
                  {saving ? "保存中…" : "保存"}
                </Text>
              </View>
            )}
          </View>
          {editing ? (
            <View style={{ marginTop: "20rpx" }}>
              <Input
                className="ss-input"
                placeholder="标题"
                value={editTitle}
                onInput={(e) => setEditTitle(e.detail.value)}
              />
              <Textarea
                value={editContent}
                autoHeight
                maxlength={8000}
                placeholder="心签内容（支持 Markdown 表格）"
                onInput={(e) => setEditContent(e.detail.value)}
                style={{
                  marginTop: "16rpx",
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: "320rpx",
                  background: "#f7f8fa",
                  border: "1rpx solid #e5e6eb",
                  borderRadius: "12rpx",
                  padding: "20rpx",
                  fontSize: "30rpx",
                  color: "#333",
                  lineHeight: "48rpx"
                }}
              />
            </View>
          ) : (
            <View style={{ marginTop: "20rpx" }}>
              <RichText
                text={note.content}
                textStyle={{ fontSize: "30rpx", color: "#333", lineHeight: "52rpx" }}
              />
            </View>
          )}
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
