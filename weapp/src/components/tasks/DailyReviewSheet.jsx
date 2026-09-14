import { useState, useEffect, useMemo } from "react";
import Taro from "@tarojs/taro";
import { View, Text, ScrollView, Textarea } from "@tarojs/components";
import { get, post } from "@/utils/api";
import theme from "./theme";

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isDone(t) {
  return ["completed", "done", "archived"].includes(String(t?.status || "").toLowerCase());
}

const HEART_TYPES = ["emotion", "inspiration", "material", "memo", "share", "ledger"];

function ReviewRow({ label, children }) {
  return (
    <View style={{ marginBottom: "24rpx" }}>
      <Text style={{ fontSize: "20rpx", color: theme.inkTertiary, letterSpacing: "4rpx" }}>{label}</Text>
      <View style={{ marginTop: "10rpx" }}>{children}</View>
    </View>
  );
}

// 今日复盘：真实数据回望 + 一句话沉淀为复盘心签
export default function DailyReviewSheet({ visible, onClose, tasks, onSaved }) {
  const [notes, setNotes] = useState([]);
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    get("/notes", { limit: 100 }, { silent: true })
      .then((list) => setNotes(Array.isArray(list) ? list : []))
      .catch(() => setNotes([]));
  }, [visible]);

  const stats = useMemo(() => {
    const topTasks = (tasks || []).filter((t) => !t.parent_task_id);
    const doneToday = topTasks.filter((t) => isDone(t) && isToday(t.completed_at));
    const dueToday = topTasks.filter((t) => {
      if (isDone(t)) return false;
      const end = t.end_time || t.due_at || t.reminder_time;
      return end && isToday(end);
    });
    const pending = topTasks.filter((t) => !isDone(t));
    const heartsToday = notes.filter(
      (n) => isToday(n.created_date) && (HEART_TYPES.includes(n.source_type) || (n.tags || []).includes("心签"))
    );
    return { doneToday, dueToday, pending, heartsToday };
  }, [tasks, notes]);

  const todayLabel = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  const saveReflection = async () => {
    const text = reflection.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const note = await post("/notes", {
        title: `今日复盘 · ${todayLabel}`,
        content: text,
        plain_text: text,
        source_type: "emotion",
        tags: ["复盘", "心签"]
      });
      Taro.showToast({ title: "复盘已收好", icon: "success" });
      setReflection("");
      onSaved?.();
      onClose();
      if (note?.id) {
        post("/functions/analyzeHeartSign", {
          note_id: note.id,
          note_data: { plain_text: text, content: text, tags: ["复盘", "心签"] }
        }, { silent: true }).catch(() => {});
      }
    } catch (err) {
      Taro.showToast({ title: "保存失败，请重试", icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(28,28,30,0.5)",
        zIndex: 300,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center"
      }}
      onClick={onClose}
    >
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "86vh",
          background: theme.card,
          borderTopLeftRadius: "32rpx",
          borderTopRightRadius: "32rpx",
          padding: "40rpx 36rpx 60rpx"
        }}
      >
        <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8rpx" }}>
          <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme.primary }}>今日复盘</Text>
          <Text style={{ fontSize: "40rpx", color: theme.inkQuaternary, padding: "0 8rpx" }} onClick={onClose}>×</Text>
        </View>
        <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, marginBottom: "28rpx" }}>{todayLabel} · 60 秒回望</Text>

        <ScrollView scrollY style={{ maxHeight: "52vh" }}>
          <ReviewRow label={`今日兑现 · ${stats.doneToday.length} 条`}>
            {stats.doneToday.length === 0 ? (
              <Text style={{ fontSize: "26rpx", color: theme.inkTertiary }}>今天还没有完成的约定，从最小的一步开始也行。</Text>
            ) : (
              stats.doneToday.slice(0, 5).map((t) => (
                <View key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: "10rpx" }}>
                  <Text style={{ fontSize: "26rpx", color: "#4a8a5e", marginRight: "12rpx" }}>✓</Text>
                  <Text style={{ fontSize: "26rpx", color: theme.inkSecondary, flex: 1 }} numberOfLines={1}>{t.title}</Text>
                </View>
              ))
            )}
          </ReviewRow>

          <ReviewRow label={`还在进行 · ${stats.pending.length} 条${stats.dueToday.length > 0 ? `（今日到期 ${stats.dueToday.length}）` : ""}`}>
            {stats.pending.length === 0 ? (
              <Text style={{ fontSize: "26rpx", color: theme.inkTertiary }}>没有未完成的约定，一身轻松。</Text>
            ) : (
              stats.pending.slice(0, 5).map((t) => (
                <Text key={t.id} style={{ fontSize: "26rpx", color: theme.inkSecondary, marginBottom: "10rpx" }} numberOfLines={1}>
                  · {t.title}
                </Text>
              ))
            )}
          </ReviewRow>

          <ReviewRow label={`今日心签 · ${stats.heartsToday.length} 条`}>
            {stats.heartsToday.length === 0 ? (
              <Text style={{ fontSize: "26rpx", color: theme.inkTertiary }}>今天还没有记录心情，一句话也算数。</Text>
            ) : (
              (() => {
                const latest = stats.heartsToday[0];
                const text = latest.plain_text || latest.content || "";
                return (
                  <Text style={{ fontSize: "26rpx", color: theme.inkSecondary, fontStyle: "italic", lineHeight: "42rpx" }}>
                    “{text.slice(0, 80)}{text.length > 80 ? "…" : ""}”
                  </Text>
                );
              })()
            )}
          </ReviewRow>
        </ScrollView>

        <View style={{ marginTop: "28rpx" }}>
          <Text style={{ fontSize: "20rpx", color: theme.inkTertiary, letterSpacing: "4rpx", marginBottom: "10rpx" }}>
            给今天留一句话
          </Text>
          <Textarea
            value={reflection}
            maxlength={500}
            placeholder="今天最想说的一句话、一个感谢、一个明天想做到的小事…"
            placeholderStyle={{ color: theme.inkQuaternary }}
            onInput={(e) => setReflection(e.detail.value)}
            style={{
              width: "100%",
              height: "160rpx",
              background: theme.paper,
              border: `1rpx solid ${theme.border}`,
              borderRadius: "14rpx",
              padding: "20rpx",
              fontSize: "28rpx",
              color: theme.ink,
              boxSizing: "border-box"
            }}
          />
          <View
            onClick={saveReflection}
            style={{
              marginTop: "20rpx",
              padding: "22rpx 0",
              borderRadius: "14rpx",
              background: saving || !reflection.trim() ? theme.border : theme.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: "28rpx", fontWeight: 600, color: "#fff" }}>
              {saving ? "收好中…" : "收进今日复盘 →"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
