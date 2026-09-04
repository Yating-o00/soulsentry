import { useState, useMemo, useCallback, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Input, Button } from "@tarojs/components";
import { get, post, patch, del } from "@/utils/api";
import SharePoster from "@/components/SharePoster";
import VaultSheet from "@/components/VaultSheet";
import ReviewDrawer from "@/components/ReviewDrawer";
import theme from "@/components/tasks/theme";

const DENSITY_KEY = "heart_response_density";
const DENSITY_OPTIONS = [
  { key: "full", label: "多陪我说说" },
  { key: "light", label: "轻轻回应" },
  { key: "mute", label: "只收不答" }
];

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
  emotion: { label: "情绪", color: "#c97b8a", bg: "#fce8ec" },
  inspiration: { label: "灵感", color: "#d97706", bg: "#fef3c7" },
  material: { label: "资料", color: "#5b82a0", bg: "#e8f0f5" },
  memo: { label: "备忘", color: "#8a7d6b", bg: "#f4f0ea" },
  share: { label: "分享", color: "#6e8a73", bg: "#e8f5e9" }
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

function getResponseTag(note) {
  return note.metadata?.ai_analysis?.response_tag || "";
}

function getTitle(note) {
  const text = note.plain_text || note.content || "";
  if (!note.title && text.length <= 50) return text;
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
  const [vaultVisible, setVaultVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [reviewVisible, setReviewVisible] = useState(false);
  const [density, setDensity] = useState(() => Taro.getStorageSync(DENSITY_KEY) || "light");
  const scrollRef = useRef(null);

  const setDensityAndSave = (val) => {
    setDensity(val);
    Taro.setStorageSync(DENSITY_KEY, val);
  };

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

  const setActionLoad = (key, val) => {
    setActionLoading((prev) => ({ ...prev, [key]: val }));
  };

  const togglePin = async (note, e) => {
    e?.stopPropagation?.();
    const key = `pin-${note.id}`;
    setActionLoad(key, true);
    try {
      await updateNoteMeta(note, { pinned: !isPinned(note) });
    } finally {
      setActionLoad(key, false);
    }
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
    const key = `correct-${note.id}`;
    setActionLoad(key, true);
    try {
      await patch(`/notes/${note.id}`, { source_type: nextType });
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, source_type: nextType } : n)));
      Taro.showToast({ title: `已改为${TYPE_META[nextType].label}签`, icon: "none" });
    } finally {
      setActionLoad(key, false);
    }
  };

  const convertTask = async (note, e) => {
    e?.stopPropagation?.();
    const key = `task-${note.id}`;
    setActionLoad(key, true);
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
    } finally {
      setActionLoad(key, false);
    }
  };

  const addToKnowledge = async (note, e) => {
    e?.stopPropagation?.();
    const key = `kb-${note.id}`;
    setActionLoad(key, true);
    try {
      await post("/knowledge-bases", {
        title: getTitle(note),
        content: note.plain_text || note.content || "",
        source_type: "note",
        source_id: note.id,
        tags: Array.isArray(note.tags) ? note.tags : [],
        category: note.metadata?.ai_analysis?.category || "其他"
      });
      await updateNoteMeta(note, { in_knowledge_base: true });
      Taro.showToast({ title: "已沉淀到知识库", icon: "success" });
    } catch (err) {
      console.error("addToKnowledge failed", err);
      Taro.showToast({ title: "沉淀失败", icon: "none" });
    } finally {
      setActionLoad(key, false);
    }
  };

  const shareNote = async (note, e) => {
    e?.stopPropagation?.();
    const key = `share-${note.id}`;
    setActionLoad(key, true);
    try {
      const share = await post(`/public/share/generate/note/${note.id}`);
      setPosterNote(note);
      setPosterToken(share.token || "");
    } catch {
      Taro.showToast({ title: "分享生成失败", icon: "none" });
    } finally {
      setActionLoad(key, false);
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
      const conversation = note.metadata?.conversation || [];
      const userRounds = conversation.filter((m) => m.role === "user").length;
      const round = userRounds + 1;
      const res = await post("/functions/followupHeartSign", {
        note_id: note.id,
        text,
        round,
        density
      });
      const metaPatch = { conversation: res.conversation || [] };
      if (res.closing) metaPatch.conversation_closed = true;
      await updateNoteMeta(note, metaPatch);
      setContinueMap((prev) => ({ ...prev, [note.id]: "" }));
    } catch {
      Taro.showToast({ title: "发送失败", icon: "none" });
    } finally {
      setSubmittingId(null);
    }
  };

  const renderHeader = () => (
    <View style={{ padding: "40rpx 32rpx 24rpx" }}>
      <View style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View>
          <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "3rpx" }}>{dateLine()}</Text>
        </View>
        <View style={{ display: "flex", alignItems: "center", gap: "12rpx" }}>
          <View
            onClick={() => setReviewVisible(true)}
            style={{
              padding: "8rpx 16rpx",
              borderRadius: "999rpx",
              background: theme.primaryMist,
              display: "flex",
              alignItems: "center",
              gap: "6rpx"
            }}
          >
            <Text style={{ fontSize: "22rpx", color: theme.primary }}>回顾</Text>
          </View>
          <View
            onClick={() => setVaultVisible(true)}
            style={{
              padding: "8rpx 16rpx",
              borderRadius: "999rpx",
              background: theme.primaryMist,
              display: "flex",
              alignItems: "center",
              gap: "6rpx"
            }}
          >
            <Text style={{ fontSize: "22rpx", color: theme.primary }}>🔒 保险柜</Text>
          </View>
        </View>
      </View>
      <View style={{ marginTop: "16rpx" }}>
        <Text style={{ fontSize: "52rpx", fontWeight: 700, color: theme.primary, lineHeight: "72rpx" }}>
          {greeting()}。
        </Text>
      </View>
      <View style={{ marginTop: "16rpx" }}>
        <Text style={{ fontSize: "34rpx", fontWeight: 500, color: theme.inkSecondary, lineHeight: "52rpx" }}>
          说给
          <Text style={{ color: theme.primary }}>另一个自己</Text>
          听。
        </Text>
      </View>
      <View style={{ marginTop: "12rpx" }}>
        <Text style={{ fontSize: "26rpx", color: theme.inkTertiary, lineHeight: "42rpx" }}>
          此刻的心情、刷到的好文章、怕忘的号码……丢进来就好。
        </Text>
      </View>
      <View style={{ marginTop: "20rpx", display: "flex", gap: "10rpx", flexWrap: "wrap" }}>
        {DENSITY_OPTIONS.map((d) => {
          const active = density === d.key;
          return (
            <View
              key={d.key}
              onClick={() => setDensityAndSave(d.key)}
              style={{
                padding: "8rpx 18rpx",
                borderRadius: "999rpx",
                border: `1rpx solid ${active ? theme.primary : theme.border}`,
                background: active ? theme.primary : theme.card
              }}
            >
              <Text style={{ fontSize: "22rpx", color: active ? "#fff" : theme.inkTertiary }}>{d.label}</Text>
            </View>
          );
        })}
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
                border: `1rpx solid ${active ? theme.primary : theme.border}`,
                background: active ? theme.primary : theme.card
              }}
            >
              <Text style={{ fontSize: "26rpx", color: active ? "#fff" : theme.inkTertiary }}>{f.label}</Text>
              {counts[f.key] > 0 && (
                <Text style={{ fontSize: "20rpx", color: active ? "rgba(255,255,255,0.8)" : theme.inkQuaternary, marginLeft: "8rpx" }}>
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
    <View style={{ textAlign: "center", padding: "80rpx 40rpx" }}>
      <View
        style={{
          width: "112rpx",
          height: "112rpx",
          margin: "0 auto 32rpx",
          borderRadius: "50%",
          background: theme.primaryMist,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Text style={{ fontSize: "56rpx", color: theme.primary }}>签</Text>
      </View>
      <Text style={{ fontSize: "34rpx", color: theme.inkSecondary, fontWeight: 700, marginBottom: "16rpx" }}>
        这里还空着
      </Text>
      <Text style={{ fontSize: "28rpx", color: theme.inkTertiary, lineHeight: "48rpx" }}>
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
              border: `1rpx dashed ${theme.border}`,
              background: theme.card
            }}
          >
            <Text style={{ fontSize: "24rpx", color: theme.inkTertiary }}>{t}</Text>
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
    const isCrisis = note.metadata?.is_crisis;

    return (
      <View
        style={{
          margin: "0 24rpx 28rpx",
          borderRadius: "18rpx",
          background: theme.card,
          padding: "28rpx 28rpx 20rpx",
          boxShadow: "0 2rpx 12rpx rgba(0,0,0,0.04)",
          border: pinned ? `2rpx solid ${theme.primary}` : "1rpx solid transparent"
        }}
      >
        <View style={{ display: "flex", alignItems: "center", gap: "12rpx", marginBottom: "20rpx", flexWrap: "wrap" }}>
          <View style={{ padding: "4rpx 16rpx", borderRadius: "999rpx", background: meta.bg }}>
            <Text style={{ fontSize: "22rpx", color: meta.color, fontWeight: 600 }}>{meta.label}签</Text>
          </View>
          {pinned && (
            <View style={{ padding: "4rpx 14rpx", borderRadius: "999rpx", border: `1rpx solid ${theme.primary}` }}>
              <Text style={{ fontSize: "20rpx", color: theme.primary }}>已置顶</Text>
            </View>
          )}
          {converted && (
            <View style={{ padding: "4rpx 14rpx", borderRadius: "999rpx", border: "1rpx solid #6e8a73" }}>
              <Text style={{ fontSize: "20rpx", color: "#6e8a73" }}>已转约定</Text>
            </View>
          )}
          {inKb && (
            <View style={{ padding: "4rpx 14rpx", borderRadius: "999rpx", border: "1rpx solid #5b82a0" }}>
              <Text style={{ fontSize: "20rpx", color: "#5b82a0" }}>已沉淀</Text>
            </View>
          )}
          {isCrisis && (
            <View style={{ padding: "4rpx 14rpx", borderRadius: "999rpx", border: "1rpx solid #db3356", background: "#fce8ec" }}>
              <Text style={{ fontSize: "20rpx", color: "#db3356" }}>需要关注</Text>
            </View>
          )}
          <Text style={{ marginLeft: "auto", fontSize: "20rpx", color: theme.inkQuaternary }}>{fmtTime(note.created_date)}</Text>
        </View>

        <Text style={{ fontSize: "32rpx", fontWeight: 700, color: theme.inkSecondary, marginBottom: "16rpx", lineHeight: "48rpx" }}>
          {getTitle(note)}
        </Text>

        <View style={{ marginBottom: "20rpx" }}>
          <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, marginBottom: "8rpx" }}>你</Text>
          <Text style={{ fontSize: "30rpx", color: theme.ink, lineHeight: "50rpx", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {note.plain_text || note.content || ""}
          </Text>
        </View>

        {response ? (
          <View style={{ background: theme.primaryMist, borderRadius: "12rpx", padding: "20rpx", marginBottom: "20rpx" }}>
            <View style={{ display: "flex", alignItems: "center", gap: "10rpx", marginBottom: "8rpx" }}>
              <Text style={{ fontSize: "22rpx", color: theme.primary }}>另一个你 · 回应</Text>
              {getResponseTag(note) ? (
                <View style={{ padding: "2rpx 10rpx", borderRadius: "999rpx", background: "rgba(91,130,160,0.12)" }}>
                  <Text style={{ fontSize: "18rpx", color: theme.water }}>{getResponseTag(note)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: "28rpx", color: theme.inkSecondary, lineHeight: "48rpx" }}>{response}</Text>
          </View>
        ) : null}

        {conversation.map((m, idx) => (
          <View key={idx} style={{ marginBottom: "16rpx" }}>
            <View style={{ display: "flex", alignItems: "center", gap: "10rpx", marginBottom: "8rpx" }}>
              <Text style={{ fontSize: "22rpx", color: m.role === "user" ? theme.inkQuaternary : theme.primary }}>
                {m.role === "user" ? "你" : "另一个你"}
              </Text>
              {m.role === "other" && m.tag ? (
                <View style={{ padding: "2rpx 10rpx", borderRadius: "999rpx", background: "rgba(91,130,160,0.12)" }}>
                  <Text style={{ fontSize: "18rpx", color: theme.water }}>{m.tag}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: "28rpx", color: theme.ink, lineHeight: "48rpx", whiteSpace: "pre-wrap" }}>{m.text}</Text>
          </View>
        ))}

        {note.metadata?.conversation_closed ? null : (
          <View
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12rpx",
              borderTop: `1rpx dashed ${theme.border}`,
              paddingTop: "20rpx",
              marginTop: "8rpx"
            }}
          >
            <Input
              style={{ flex: 1, fontSize: "28rpx", color: theme.ink, padding: "10rpx 0" }}
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
                background: theme.primary,
                color: "#fff",
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
        )}

        <View style={{ display: "flex", flexWrap: "wrap", gap: "8rpx", marginTop: "20rpx" }}>
          <ActionBtn onClick={(e) => togglePin(note, e)} active={pinned} text={pinned ? "已置顶" : "置顶"} loading={actionLoading[`pin-${note.id}`]} />
          <ActionBtn onClick={(e) => correctType(note, e)} text="分错了" loading={actionLoading[`correct-${note.id}`]} />
          {!converted && <ActionBtn onClick={(e) => convertTask(note, e)} text="转约定" loading={actionLoading[`task-${note.id}`]} />}
          {!inKb && <ActionBtn onClick={(e) => addToKnowledge(note, e)} text="沉淀" loading={actionLoading[`kb-${note.id}`]} />}
          <ActionBtn onClick={(e) => shareNote(note, e)} text="签卡" loading={actionLoading[`share-${note.id}`]} />
          <ActionBtn onClick={(e) => deleteNote(note, e)} text="删除" danger />
        </View>
      </View>
    );
  };

  const goToNote = (note) => {
    setFilter("all");
    setTimeout(() => {
      const id = note.id;
      const el = Taro.createSelectorQuery().select(`#note-${id}`);
      el.boundingClientRect((rect) => {
        if (rect) scrollRef.current?.scrollTo?.({ top: rect.top, animated: true });
      }).exec();
    }, 100);
  };

  return (
    <View style={{ minHeight: "100vh", background: theme.paper, paddingBottom: "140rpx" }}>
      <ScrollView ref={scrollRef} scrollY style={{ height: "100vh" }}>
        {renderHeader()}
        {renderFilters()}
        {loading && notes.length === 0 ? (
          <View style={{ textAlign: "center", padding: "80rpx" }}>
            <Text style={{ fontSize: "28rpx", color: theme.inkTertiary }}>加载中…</Text>
          </View>
        ) : null}
        {!loading && filteredNotes.length === 0 ? renderEmpty() : filteredNotes.map((n) => <View key={n.id} id={`note-${n.id}`}>{renderCard(n)}</View>)}
        <View style={{ height: "120rpx" }} />
      </ScrollView>

      <View
        onClick={goCreate}
        style={{
          position: "fixed",
          right: "40rpx",
          bottom: "160rpx",
          width: "100rpx",
          height: "100rpx",
          borderRadius: "50%",
          background: theme.primary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8rpx 24rpx rgba(56,72,119,0.28)"
        }}
      >
        <Text style={{ fontSize: "56rpx", color: "#fff" }}>+</Text>
      </View>

      {posterNote && <SharePoster note={posterNote} token={posterToken} onClose={closePoster} />}
      <VaultSheet visible={vaultVisible} onClose={() => setVaultVisible(false)} theme={theme} />
      <ReviewDrawer visible={reviewVisible} onClose={() => setReviewVisible(false)} notes={notes} onGoToNote={goToNote} theme={theme} />
    </View>
  );
}

function ActionBtn({ onClick, text, active, danger, loading }) {
  return (
    <View
      onClick={loading ? undefined : onClick}
      style={{
        padding: "8rpx 16rpx",
        borderRadius: "10rpx",
        background: active ? theme.primary : theme.paper,
        border: `1rpx solid ${theme.border}`,
        opacity: loading ? 0.6 : 1
      }}
    >
      <Text style={{ fontSize: "22rpx", color: danger ? "#db3356" : active ? "#fff" : theme.inkTertiary }}>
        {loading ? "…" : text}
      </Text>
    </View>
  );
}
