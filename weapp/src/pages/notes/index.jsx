import { useState, useMemo, useCallback, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Input, Textarea, Button } from "@tarojs/components";
import { get, post, patch, del } from "@/utils/api";
import SharePoster from "@/components/SharePoster";

const THEME = {
  bg: "#ece4d9",
  surface: "#f4f0ea",
  card: "#fffbf5",
  ink: "#4f483e",
  inkStrong: "#3a352c",
  muted: "#8a7d6b",
  accent: "#f54001",
  tint: "#ffc198",
  line: "rgba(79,72,62,.14)"
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "emotion", label: "情绪签" },
  { key: "inspiration", label: "灵感签" },
  { key: "material", label: "资料签" },
  { key: "memo", label: "备忘签" },
  { key: "share", label: "分享签" },
  { key: "pinned", label: "已置顶" }
];

const TYPE_META = {
  emotion: { label: "情绪", color: "#e2607f", bg: "#fbe4ea" },
  inspiration: { label: "灵感", color: "#d93800", bg: "#ffe4d6" },
  material: { label: "资料", color: "#4a7ba6", bg: "#e0ecf5" },
  memo: { label: "备忘", color: "#8a7d6b", bg: "#ece7dc" },
  share: { label: "分享", color: "#557a49", bg: "#e5eede" }
};

const TYPE_ORDER = ["emotion", "inspiration", "material", "memo", "share"];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "凌晨好";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function dateLine() {
  const now = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} · 星期${week}`;
}

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

function getNoteType(note) {
  const st = note.source_type;
  if (TYPE_META[st]) return st;
  const cat = note.metadata?.ai_analysis?.category;
  const map = { 情绪: "emotion", 灵感: "inspiration", 资料: "material", 备忘: "memo", 分享: "share" };
  if (map[cat]) return map[cat];
  return "emotion";
}

function isPinned(note) {
  return !!note.metadata?.pinned;
}

function getAiResponse(note) {
  return note.metadata?.ai_analysis?.emotional_response || "";
}

function getTitle(note) {
  return note.title || "心签";
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [posterNote, setPosterNote] = useState(null);
  const [posterToken, setPosterToken] = useState("");
  const [continueMap, setContinueMap] = useState({});
  const [submittingId, setSubmittingId] = useState(null);
  const scrollRef = useRef(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get("/notes", { sort: "-updated_date", limit: 200 });
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    fetchNotes();
  });

  const filteredNotes = useMemo(() => {
    let list = [...notes];
    if (filter === "pinned") {
      list = list.filter((n) => isPinned(n));
    } else if (filter !== "all") {
      list = list.filter((n) => getNoteType(n) === filter);
    }
    list.sort((a, b) => {
      if (isPinned(a) !== isPinned(b)) return isPinned(a) ? -1 : 1;
      return new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date);
    });
    return list;
  }, [notes, filter]);

  const counts = useMemo(() => {
    const c = { all: notes.length, pinned: notes.filter((n) => isPinned(n)).length };
    FILTERS.forEach((f) => {
      if (f.key !== "all" && f.key !== "pinned") {
        c[f.key] = notes.filter((n) => getNoteType(n) === f.key).length;
      }
    });
    return c;
  }, [notes]);

  const updateNoteMeta = async (note, patchMeta) => {
    const current = note.metadata || {};
    const next = { ...current, ...patchMeta };
    await patch(`/notes/${note.id}`, { metadata: next });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, metadata: next } : n)));
  };

  const togglePin = async (note, e) => {
    e?.stopPropagation?.();
    await updateNoteMeta(note, { pinned: !isPinned(note) });
  };

  const deleteNote = async (note, e) => {
    e?.stopPropagation?.();
    const res = await Taro.showModal({ title: "确认删除", content: "删除后可在回收站找回，是否继续？" });
    if (!res.confirm) return;
    try {
      await del(`/notes/${note.id}`);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch {}
  };

  const correctType = async (note, e) => {
    e?.stopPropagation?.();
    const current = getNoteType(note);
    const idx = TYPE_ORDER.indexOf(current);
    const nextType = TYPE_ORDER[(idx + 1) % TYPE_ORDER.length];
    await patch(`/notes/${note.id}`, { source_type: nextType });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, source_type: nextType } : n)));
  };

  const convertTask = async (note, e) => {
    e?.stopPropagation?.();
    try {
      const text = note.plain_text || note.content || "";
      const res = await post("/functions/parseTaskInput", { input: text, date: new Date().toISOString().slice(0, 10) });
      await post("/tasks", {
        title: res.title || getTitle(note),
        description: text,
        reminder_time: res.reminder_time,
        end_time: res.end_time,
        priority: res.priority || "medium",
        category: res.category || "other",
        source_type: "note"
      });
      await updateNoteMeta(note, { converted_task: true });
      Taro.showToast({ title: "已转为约定", icon: "success" });
    } catch {
      Taro.showToast({ title: "转换失败", icon: "none" });
    }
  };

  const addToKnowledge = async (note, e) => {
    e?.stopPropagation?.();
    try {
      await post("/knowledge-base", {
        title: getTitle(note),
        content: note.plain_text || note.content || "",
        tags: note.tags || [],
        source_type: "note",
        source_id: note.id
      });
      await updateNoteMeta(note, { in_knowledge_base: true });
      Taro.showToast({ title: "已沉淀到知识库", icon: "success" });
    } catch {
      Taro.showToast({ title: "沉淀失败", icon: "none" });
    }
  };

  const shareNote = async (note, e) => {
    e?.stopPropagation?.();
    try {
      const share = await post(`/public/share/generate/note/${note.id}`);
      setPosterNote(note);
      setPosterToken(share.token || "");
    } catch {
      Taro.showToast({ title: "分享生成失败", icon: "none" });
    }
  };

  const closePoster = () => {
    setPosterNote(null);
    setPosterToken("");
  };

  const goCreate = () => {
    Taro.navigateTo({ url: "/pages/note-create/index" });
  };

  const setContinueText = (id, text) => {
    setContinueMap((prev) => ({ ...prev, [id]: text }));
  };

  const submitContinue = async (note) => {
    const text = String(continueMap[note.id] || "").trim();
    if (!text) return;
    setSubmittingId(note.id);
    try {
      await post("/note-comments", { note_id: note.id, content: text });
      // 本地生成一条跟进回应，避免等 Kimi
      const type = getNoteType(note);
      const followups = {
        emotion: "嗯，我在听。你慢慢说，我都在。",
        inspiration: "往深想一步：这个念头最想解决的，是哪一个瞬间？",
        material: "这条如果沉淀进知识库，我会把它和之前的内容关联起来。",
        memo: "嗯，这条也一并记在这张签里了。",
        share: "好，分享的内容我都放进签卡里了。"
      };
      const reply = followups[type] || "我记下了。";
      const conversation = note.metadata?.conversation || [];
      const now = new Date().toISOString();
      await updateNoteMeta(note, {
        conversation: [...conversation, { role: "user", text, ts: now }, { role: "other", text: reply, ts: now }]
      });
      setContinueMap((prev) => ({ ...prev, [note.id]: "" }));
    } catch {
      Taro.showToast({ title: "发送失败", icon: "none" });
    } finally {
      setSubmittingId(null);
    }
  };

  const renderHeader = () => (
    <View style={{ padding: "40rpx 32rpx 24rpx" }}>
      <View>
        <Text style={{ fontSize: "22rpx", color: THEME.muted, letterSpacing: "3rpx" }}>{dateLine()}</Text>
      </View>
      <View style={{ marginTop: "16rpx" }}>
        <Text style={{ fontSize: "52rpx", fontWeight: 700, color: THEME.inkStrong, lineHeight: "72rpx" }}>
          {greeting()}。
        </Text>
      </View>
      <View style={{ marginTop: "16rpx" }}>
        <Text style={{ fontSize: "34rpx", fontWeight: 500, color: THEME.ink, lineHeight: "52rpx" }}>
          什么都可以放在这里，
          <Text style={{ color: THEME.accent }}>说给另一个自己</Text>听。
        </Text>
      </View>
      <View style={{ marginTop: "12rpx" }}>
        <Text style={{ fontSize: "26rpx", color: THEME.muted, lineHeight: "42rpx" }}>
          此刻的心情、刷到的好文章、怕忘的号码……丢进来就好。
        </Text>
      </View>
    </View>
  );

  const renderFilters = () => (
    <ScrollView scrollX showScrollbar={false} style={{ whiteSpace: "nowrap", padding: "0 24rpx 24rpx" }}>
      <View style={{ display: "inline-flex", gap: "12rpx" }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <View
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10rpx 22rpx",
                borderRadius: "999rpx",
                border: `1rpx solid ${THEME.line}`,
                background: active ? THEME.inkStrong : "transparent"
              }}
            >
              <Text style={{ fontSize: "26rpx", color: active ? THEME.card : THEME.muted }}>
                {f.label}
              </Text>
              {counts[f.key] > 0 && (
                <Text style={{ fontSize: "20rpx", color: active ? "rgba(255,251,245,0.7)" : THEME.muted, marginLeft: "8rpx" }}>
                  {counts[f.key]}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderEmpty = () => (
    <View style={{ textAlign: "center", padding: "80rpx 40rpx", color: THEME.muted }}>
      <View
        style={{
          width: "112rpx",
          height: "112rpx",
          margin: "0 auto 32rpx",
          borderRadius: "50%",
          background: THEME.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1rpx solid ${THEME.line}`
        }}
      >
        <Text style={{ fontSize: "56rpx", color: THEME.accent }}>签</Text>
      </View>
      <Text style={{ fontSize: "34rpx", color: THEME.inkStrong, fontWeight: 700, marginBottom: "16rpx" }}>
        这里还空着
      </Text>
      <Text style={{ fontSize: "28rpx", color: THEME.muted, lineHeight: "48rpx" }}>
        此刻的心情、刷到的好文章、怕忘的号码……都可以丢进来。
      </Text>
      <View style={{ display: "flex", gap: "16rpx", justifyContent: "center", marginTop: "32rpx", flexWrap: "wrap" }}>
        {["今天的心情有点复杂", "这篇文章讲得真好，收藏一下", "突然想到一个点子"].map((t) => (
          <View
            key={t}
            onClick={() => Taro.navigateTo({ url: `/pages/note-create/index?preset=${encodeURIComponent(t)}` })}
            style={{
              padding: "12rpx 24rpx",
              borderRadius: "999rpx",
              border: `1rpx dashed ${THEME.line}`,
              background: "transparent"
            }}
          >
            <Text style={{ fontSize: "24rpx", color: THEME.muted }}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderCard = (note) => {
    const type = getNoteType(note);
    const meta = TYPE_META[type] || TYPE_META.emotion;
    const pinned = isPinned(note);
    const response = getAiResponse(note);
    const conversation = note.metadata?.conversation || [];
    const converted = note.metadata?.converted_task;
    const inKb = note.metadata?.in_knowledge_base;

    return (
      <View
        key={note.id}
        style={{
          margin: "0 24rpx 28rpx",
          borderRadius: "18rpx",
          background: THEME.card,
          padding: "28rpx 28rpx 20rpx",
          boxShadow: "0 2rpx 6rpx rgba(79,72,62,.05), 0 10rpx 30rpx rgba(79,72,62,.06)",
          border: pinned ? `2rpx solid ${THEME.accent}` : "none"
        }}
      >
        {/* type + time + pin */}
        <View style={{ display: "flex", alignItems: "center", gap: "12rpx", marginBottom: "20rpx" }}>
          <View style={{ padding: "4rpx 16rpx", borderRadius: "999rpx", background: meta.bg }}>
            <Text style={{ fontSize: "22rpx", color: meta.color, fontWeight: 600 }}>{meta.label}签</Text>
          </View>
          {pinned && (
            <View style={{ padding: "4rpx 14rpx", borderRadius: "999rpx", border: `1rpx solid ${THEME.accent}` }}>
              <Text style={{ fontSize: "20rpx", color: THEME.accent }}>已置顶</Text>
            </View>
          )}
          {converted && (
            <View style={{ padding: "4rpx 14rpx", borderRadius: "999rpx", border: `1rpx solid #557a49` }}>
              <Text style={{ fontSize: "20rpx", color: "#557a49" }}>已转约定</Text>
            </View>
          )}
          {inKb && (
            <View style={{ padding: "4rpx 14rpx", borderRadius: "999rpx", border: `1rpx solid #4a7ba6` }}>
              <Text style={{ fontSize: "20rpx", color: "#4a7ba6" }}>已沉淀</Text>
            </View>
          )}
          <Text style={{ marginLeft: "auto", fontSize: "20rpx", color: THEME.muted }}>{fmtTime(note.created_date)}</Text>
        </View>

        {/* title */}
        <Text style={{ fontSize: "32rpx", fontWeight: 700, color: THEME.inkStrong, marginBottom: "16rpx", lineHeight: "48rpx" }}>
          {getTitle(note)}
        </Text>

        {/* user message */}
        <View style={{ marginBottom: "20rpx" }}>
          <Text style={{ fontSize: "22rpx", color: THEME.muted, marginBottom: "8rpx" }}>你</Text>
          <Text style={{ fontSize: "30rpx", color: THEME.inkStrong, lineHeight: "50rpx", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {note.plain_text || note.content || ""}
          </Text>
        </View>

        {/* AI response */}
        {response ? (
          <View style={{ background: THEME.surface, borderRadius: "12rpx", padding: "20rpx", marginBottom: "20rpx" }}>
            <Text style={{ fontSize: "22rpx", color: THEME.accent, marginBottom: "8rpx" }}>另一个你 · 回应</Text>
            <Text style={{ fontSize: "28rpx", color: THEME.ink, lineHeight: "48rpx" }}>{response}</Text>
          </View>
        ) : null}

        {/* conversation */}
        {conversation.map((m, idx) => (
          <View key={idx} style={{ marginBottom: "16rpx" }}>
            <Text style={{ fontSize: "22rpx", color: m.role === "user" ? THEME.muted : THEME.accent, marginBottom: "8rpx" }}>
              {m.role === "user" ? "你" : "另一个你"}
            </Text>
            <Text style={{ fontSize: "28rpx", color: THEME.inkStrong, lineHeight: "48rpx", whiteSpace: "pre-wrap" }}>{m.text}</Text>
          </View>
        ))}

        {/* continue input */}
        <View
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12rpx",
            borderTop: `1rpx dashed ${THEME.line}`,
            paddingTop: "20rpx",
            marginTop: "8rpx"
          }}
        >
          <Input
            style={{
              flex: 1,
              fontSize: "28rpx",
              color: THEME.inkStrong,
              padding: "10rpx 0"
            }}
            placeholder="继续聊聊…"
            value={continueMap[note.id] || ""}
            onInput={(e) => setContinueText(note.id, e.detail.value)}
            confirmType="send"
            onConfirm={() => submitContinue(note)}
          />
          <Button
            size="mini"
            loading={submittingId === note.id}
            disabled={!continueMap[note.id]?.trim()}
            onClick={() => submitContinue(note)}
            style={{
              background: THEME.accent,
              color: "#fffbf5",
              borderRadius: "10rpx",
              fontSize: "24rpx",
              margin: 0,
              padding: "0 20rpx",
              lineHeight: "56rpx",
              height: "56rpx"
            }}
          >
            发送
          </Button>
        </View>

        {/* actions */}
        <View style={{ display: "flex", flexWrap: "wrap", gap: "8rpx", marginTop: "20rpx" }}>
          <ActionBtn onClick={(e) => togglePin(note, e)} active={pinned} text={pinned ? "已置顶" : "置顶"} />
          <ActionBtn onClick={(e) => correctType(note, e)} text="分错了" />
          {!converted && <ActionBtn onClick={(e) => convertTask(note, e)} text="转约定" />}
          {!inKb && <ActionBtn onClick={(e) => addToKnowledge(note, e)} text="沉淀" />}
          <ActionBtn onClick={(e) => shareNote(note, e)} text="签卡" />
          <ActionBtn onClick={(e) => deleteNote(note, e)} text="删除" danger />
        </View>
      </View>
    );
  };

  return (
    <View style={{ minHeight: "100vh", background: THEME.bg, paddingBottom: "140rpx" }}>
      <ScrollView ref={scrollRef} scrollY style={{ height: "100vh" }}>
        {renderHeader()}
        {renderFilters()}
        {loading && notes.length === 0 ? (
          <View style={{ textAlign: "center", padding: "80rpx", color: THEME.muted, fontSize: "28rpx" }}>加载中…</View>
        ) : null}
        {!loading && filteredNotes.length === 0 ? renderEmpty() : filteredNotes.map(renderCard)}
        <View style={{ height: "120rpx" }} />
      </ScrollView>

      {/* FAB */}
      <View
        onClick={goCreate}
        style={{
          position: "fixed",
          right: "40rpx",
          bottom: "160rpx",
          width: "100rpx",
          height: "100rpx",
          borderRadius: "50%",
          background: THEME.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8rpx 24rpx rgba(245,64,1,.32)"
        }}
      >
        <Text style={{ fontSize: "56rpx", color: "#fffbf5" }}>+</Text>
      </View>

      {posterNote && <SharePoster note={posterNote} token={posterToken} onClose={closePoster} />}
    </View>
  );
}

function ActionBtn({ onClick, text, active, danger }) {
  return (
    <View
      onClick={onClick}
      style={{
        padding: "8rpx 16rpx",
        borderRadius: "10rpx",
        background: active ? THEME.inkStrong : THEME.surface,
        border: `1rpx solid ${THEME.line}`
      }}
    >
      <Text style={{ fontSize: "22rpx", color: danger ? "#c2446c" : active ? THEME.card : THEME.muted }}>{text}</Text>
    </View>
  );
}
