import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";
import { View, Input, Textarea, Button, ScrollView, Text } from "@tarojs/components";
import { get, post, patch } from "@/utils/api";
import VoiceInput from "@/components/VoiceInput";

function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
    } catch {}
    return value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

export default function NoteCreate() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [createdNote, setCreatedNote] = useState(null);
  const [step, setStep] = useState("form");
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState("");
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {};
    const id = params.id;
    const mode = params.mode;
    if (id && mode === "edit") {
      setEditId(id);
      setIsEdit(true);
      loadNote(id);
    }
  }, []);

  const loadNote = async (id) => {
    setLoading(true);
    try {
      const note = await get(`/notes/${id}`);
      setTitle(note.title || "");
      setContent(note.content || "");
      setTags(normalizeTags(note.tags));
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!content.trim()) {
      Taro.showToast({ title: "请输入心签内容", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: title.trim() || undefined,
        content: content.trim(),
        tags: tags.length > 0 ? tags : undefined
      };

      if (isEdit && editId) {
        await patch(`/notes/${editId}`, payload);
        Taro.showToast({ title: "更新成功", icon: "success" });
        setTimeout(() => Taro.navigateBack(), 500);
        return;
      }

      const note = await post("/notes", payload);
      setCreatedNote(note);

      // 调用 analyzeHeartSign 自动生成标题、标签和温暖回应
      try {
        const ai = await post("/functions/analyzeHeartSign", {
          note_id: note.id,
          note_data: {
            plain_text: content.trim(),
            content: content.trim(),
            tags: tags.length > 0 ? tags : ["心签"]
          }
        }, { silent: true });

        if (ai?.title && !title.trim()) {
          setTitle(ai.title);
          setCreatedNote((prev) => (prev ? { ...prev, title: ai.title } : prev));
        }
        if (ai?.tags && tags.length === 0) {
          setTags(normalizeTags(ai.tags));
          setCreatedNote((prev) => (prev ? { ...prev, tags: ai.tags } : prev));
        }
        if (ai?.ai_analysis?.emotional_response) {
          setFeedback(ai.ai_analysis.emotional_response);
        } else {
          setFeedback("你的心签已被温柔接住。愿这一份记录，成为你前行的微光。");
        }
      } catch (fbErr) {
        console.error("analyzeHeartSign failed", fbErr);
        setFeedback("你的心签已被温柔接住。愿这一份记录，成为你前行的微光。");
      }

      setStep("feedback");
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    Taro.navigateBack();
  };

  const addTag = (raw) => {
    const text = String(raw || tagInput).trim().replace(/[,，]/g, "");
    if (!text) return;
    if (tags.includes(text)) {
      setTagInput("");
      return;
    }
    setTags([...tags, text]);
    setTagInput("");
  };

  const removeTag = (idx) => {
    setTags(tags.filter((_, i) => i !== idx));
  };

  const onTagInput = (e) => {
    const value = e.detail.value || "";
    if (value.includes(",") || value.includes("，")) {
      const parts = value.split(/[,，]/);
      parts.slice(0, -1).forEach((p) => addTag(p));
      setTagInput(parts[parts.length - 1]);
      return;
    }
    setTagInput(value);
  };

  const onTagConfirm = () => {
    addTag();
  };

  const renderForm = () => (
    <View className="ss-card">
      <View className="ss-title">{isEdit ? "编辑心签" : "新建心签"}</View>
      <View className="ss-subtitle">{isEdit ? "修改心签内容" : "写下心情、感悟或目标，SoulSentry 会给你温暖的回应。"}</View>

      <View style={{ marginTop: "24rpx" }}>
        <View className="ss-label">标题</View>
        <Input
          className="ss-input"
          placeholder="给心签起个名字（可选）"
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
        />
      </View>

      {!isEdit && (
        <View style={{ marginTop: "32rpx", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <VoiceInput
            onResult={(text) => setContent(text)}
            onError={(err) => Taro.showToast({ title: err, icon: "none" })}
          />
        </View>
      )}

      <View style={{ marginTop: "24rpx" }}>
        <View className="ss-label">内容 *</View>
        <Textarea
          className="ss-textarea"
          placeholder="写下你的心签..."
          value={content}
          onInput={(e) => setContent(e.detail.value)}
        />
      </View>

      <View style={{ marginTop: "24rpx" }}>
        <View className="ss-label">标签</View>
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12rpx",
            padding: "16rpx",
            background: "#f8f9fb",
            borderRadius: "12rpx",
            border: "1rpx solid #e5e6eb"
          }}
        >
          {tags.map((tag, idx) => (
            <View
              key={`${tag}-${idx}`}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                background: "linear-gradient(135deg, #eef1f7 0%, #e8ecf5 100%)",
                borderRadius: "24rpx",
                padding: "8rpx 20rpx",
                border: "1rpx solid #d1d5db"
              }}
            >
              <Text style={{ fontSize: "26rpx", color: "#384877" }}>{tag}</Text>
              <Text
                style={{ fontSize: "24rpx", color: "#9ca3af", marginLeft: "12rpx", padding: "0 4rpx" }}
                onClick={() => removeTag(idx)}
              >
                ×
              </Text>
            </View>
          ))}
          <Input
            style={{
              minWidth: "140rpx",
              flex: 1,
              fontSize: "28rpx",
              color: "#333",
              padding: "8rpx 12rpx"
            }}
            placeholder={tags.length ? "" : "输入标签，回车或逗号添加"}
            value={tagInput}
            onInput={onTagInput}
            onConfirm={onTagConfirm}
          />
        </View>
      </View>

      <Button className="ss-btn" loading={loading} disabled={loading || !content.trim()} onClick={submit}>
        {isEdit ? "保存修改" : "发布心签"}
      </Button>
    </View>
  );

  const renderFeedback = () => (
    <View>
      <View className="ss-card" style={{ textAlign: "center", padding: "48rpx 24rpx" }}>
        <View style={{ fontSize: "64rpx", marginBottom: "16rpx" }}>💌</View>
        <View className="ss-title">心签已收到</View>
        <Text className="ss-muted">{createdNote?.title || "未命名心签"}</Text>
      </View>

      <View className="ss-card">
        <View style={{ fontSize: "32rpx", color: "#384877", fontWeight: 600, marginBottom: "16rpx" }}>
          SoulSentry 想对你说
        </View>
        <View
          style={{
            background: "linear-gradient(135deg, #f5f7fa 0%, #eef1f7 100%)",
            borderRadius: "16rpx",
            padding: "32rpx",
            borderLeft: "8rpx solid #384877"
          }}
        >
          <Text style={{ fontSize: "32rpx", color: "#333", lineHeight: "56rpx" }}>{feedback}</Text>
        </View>
      </View>

      <View className="ss-card">
        <View className="ss-section-title">你的心签</View>
        <Text style={{ fontSize: "30rpx", color: "#333", lineHeight: "52rpx" }}>{createdNote?.content}</Text>
      </View>

      <Button className="ss-btn" onClick={goBack}>完成</Button>
    </View>
  );

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        {step === "form" && renderForm()}
        {step === "feedback" && renderFeedback()}
        <View style={{ height: "40rpx" }} />
      </ScrollView>
    </View>
  );
}
