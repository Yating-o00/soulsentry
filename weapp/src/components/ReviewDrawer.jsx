import { useState, useMemo } from "react";
import Taro from "@tarojs/taro";
import { View, Text, ScrollView, Input } from "@tarojs/components";

const TAB_DRAW = "draw";
const TAB_KEYWORD = "keyword";

function fmtTime(iso) {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  const now = new Date();
  const dayDiff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
  const hm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  if (dayDiff === 0) return `今天 ${hm}`;
  if (dayDiff === 1) return `昨天 ${hm}`;
  if (dayDiff < 7) return `${dayDiff} 天前 ${hm}`;
  return `${t.getMonth() + 1}月${t.getDate()}日 ${hm}`;
}

function getNoteText(note) {
  return note.plain_text || note.content || "";
}

function getTypeLabel(note) {
  const map = { emotion: "情绪签", inspiration: "灵感签", material: "资料签", memo: "备忘签", share: "分享签" };
  return map[note.source_type] || "心签";
}

export default function ReviewDrawer({ visible, onClose, notes, onGoToNote, theme }) {
  const [tab, setTab] = useState(TAB_DRAW);
  const [drawNote, setDrawNote] = useState(null);
  const [keyword, setKeyword] = useState("");

  const pool = useMemo(() => notes.filter((n) => !n.metadata?.is_vault), [notes]);

  const results = useMemo(() => {
    const q = keyword.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    return pool
      .filter((n) => getNoteText(n).toLowerCase().includes(lower))
      .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date));
  }, [pool, keyword]);

  const drawOne = () => {
    if (!pool.length) {
      Taro.showToast({ title: "还没有心签可抽", icon: "none" });
      return;
    }
    const i = Math.floor(Math.random() * pool.length);
    setDrawNote(pool[i]);
  };

  const handleShow = () => {
    if (tab === TAB_DRAW && !drawNote) drawOne();
  };

  const goTo = (note) => {
    onClose();
    setTimeout(() => onGoToNote?.(note), 50);
  };

  const highlight = (text, q) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <Text>
        {before.length > 18 ? `…${before.slice(-18)}` : before}
        <Text style={{ color: theme.primary, fontWeight: 700 }}>{match}</Text>
        {after.length > 40 ? `${after.slice(0, 40)}…` : after}
      </Text>
    );
  };

  if (!visible) return null;

  handleShow();

  return (
    <View
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)"
      }}
      onClick={onClose}
    >
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "78vh",
          background: theme.card,
          borderRadius: "28rpx 28rpx 0 0",
          padding: "32rpx 28rpx 48rpx",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24rpx" }}>
          <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme.inkSecondary }}>回顾</Text>
          <Text onClick={onClose} style={{ fontSize: "30rpx", color: theme.inkQuaternary, padding: "8rpx" }}>
            ✕
          </Text>
        </View>

        <View
          style={{
            display: "flex",
            gap: "12rpx",
            background: theme.paper,
            borderRadius: "999rpx",
            padding: "6rpx",
            marginBottom: "24rpx"
          }}
        >
          <View
            onClick={() => setTab(TAB_DRAW)}
            style={{
              flex: 1,
              padding: "14rpx 0",
              borderRadius: "999rpx",
              background: tab === TAB_DRAW ? theme.card : "transparent",
              textAlign: "center"
            }}
          >
            <Text style={{ fontSize: "28rpx", color: tab === TAB_DRAW ? theme.inkSecondary : theme.inkQuaternary, fontWeight: 600 }}>
              抽一签
            </Text>
          </View>
          <View
            onClick={() => setTab(TAB_KEYWORD)}
            style={{
              flex: 1,
              padding: "14rpx 0",
              borderRadius: "999rpx",
              background: tab === TAB_KEYWORD ? theme.card : "transparent",
              textAlign: "center"
            }}
          >
            <Text style={{ fontSize: "28rpx", color: tab === TAB_KEYWORD ? theme.inkSecondary : theme.inkQuaternary, fontWeight: 600 }}>
              按词回顾
            </Text>
          </View>
        </View>

        <ScrollView scrollY style={{ flex: 1, maxHeight: "52vh" }}>
          {tab === TAB_DRAW && (
            <View>
              {drawNote ? (
                <View
                  onClick={() => goTo(drawNote)}
                  style={{
                    background: theme.paper,
                    borderRadius: "18rpx",
                    padding: "28rpx",
                    marginBottom: "20rpx"
                  }}
                >
                  <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, marginBottom: "12rpx" }}>
                    {getTypeLabel(drawNote)} · {fmtTime(drawNote.created_date)}
                  </Text>
                  <Text style={{ fontSize: "30rpx", color: theme.inkSecondary, lineHeight: "50rpx" }}>
                    {getNoteText(drawNote)}
                  </Text>
                  <Text style={{ fontSize: "22rpx", color: theme.primary, marginTop: "16rpx" }}>
                    —— 来自那天的你 ——
                  </Text>
                </View>
              ) : (
                <View style={{ textAlign: "center", padding: "60rpx 20rpx" }}>
                  <Text style={{ fontSize: "28rpx", color: theme.inkQuaternary }}>还没有心签可抽</Text>
                </View>
              )}
              <View
                onClick={drawOne}
                style={{
                  background: theme.primary,
                  borderRadius: "999rpx",
                  padding: "22rpx 0",
                  textAlign: "center"
                }}
              >
                <Text style={{ fontSize: "30rpx", color: "#fff", fontWeight: 600 }}>再抽一签</Text>
              </View>
            </View>
          )}

          {tab === TAB_KEYWORD && (
            <View>
              <View style={{ display: "flex", gap: "12rpx", marginBottom: "20rpx" }}>
                <Input
                  style={{
                    flex: 1,
                    height: "72rpx",
                    background: theme.paper,
                    borderRadius: "999rpx",
                    padding: "0 24rpx",
                    fontSize: "28rpx",
                    color: theme.ink
                  }}
                  placeholder="输入一个词，比如「跑步」「妈妈」「辞职」…"
                  value={keyword}
                  onInput={(e) => setKeyword(e.detail.value)}
                  onConfirm={() => {}}
                />
              </View>

              {!keyword.trim() && (
                <View style={{ textAlign: "center", padding: "40rpx 20rpx" }}>
                  <Text style={{ fontSize: "26rpx", color: theme.inkQuaternary }}>输入关键词，与过去的自己重逢</Text>
                </View>
              )}

              {keyword.trim() && !results.length && (
                <View style={{ textAlign: "center", padding: "40rpx 20rpx" }}>
                  <Text style={{ fontSize: "26rpx", color: theme.inkQuaternary }}>过去的你还没有提过「{keyword}」</Text>
                </View>
              )}

              {results.map((note) => (
                <View
                  key={note.id}
                  onClick={() => goTo(note)}
                  style={{
                    background: theme.paper,
                    borderRadius: "16rpx",
                    padding: "24rpx",
                    marginBottom: "16rpx"
                  }}
                >
                  <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, marginBottom: "8rpx" }}>
                    {fmtTime(note.created_date)} · {getTypeLabel(note)}
                  </Text>
                  <Text style={{ fontSize: "28rpx", color: theme.inkSecondary, lineHeight: "48rpx" }}>
                    {highlight(getNoteText(note), keyword.trim())}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
