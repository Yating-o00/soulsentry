// 心栈小助手（全屏聊天页）：24 小时陪伴的对话窗口
// - 对话历史持久化在服务端（/api/companion），重进/换端可续聊；10s 轮询新消息
// - 服务端巡检的主动沟通（kind=proactive）也在这条时间线上，标注「主动来聊」
// - 保留「AI 提案 → 确认生成」流程：约定/心签/链接/智能规划确认后才落库
// - 底部为手机端友好的多行聊天框：自适应高度输入 + 语音 + 发送
import { useState, useEffect, useRef, useCallback } from "react";
import Taro, { useDidShow, useDidHide } from "@tarojs/taro";
import { View, Text, Textarea, ScrollView, Image } from "@tarojs/components";
import { get, post } from "@/utils/api";
import { getToken, isDemoMode } from "@/utils/auth";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
import assistantAvatarImg from "@/assets/assistant-avatar.jpg";
import assistantFullImg from "@/assets/assistant-full.jpg";

const T = {
  primary: "#384877",
  primaryLight: "#4a5d8f",
  mist: "#eef0f5",
  card: "#ffffff",
  border: "#e8ecef",
  ink: "#1c1c1e",
  inkSecondary: "#3a3a3c",
  inkTertiary: "#63666e",
  inkQuaternary: "#9ca0a8",
  heart: "#e8a5a5",
  heartBg: "#fce8ec",
};

const TYPE_LABEL = { task: "约定", heart: "心签", link: "链接", plan: "智能规划" };
const TYPE_ICON = { task: "🤝", heart: "💌", link: "🔗", plan: "🗓️" };
const CATEGORY_LABEL = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "财务", checkin: "打卡", other: "其他"
};

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const cn = new Date(d.getTime() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${cn.getUTCMonth() + 1}月${cn.getUTCDate()}日 ${pad(cn.getUTCHours())}:${pad(cn.getUTCMinutes())}`;
}

// 与心流页一致的账本签识别（单处金额+消费语境才算）
function detectLedgerLike(t) {
  const s = String(t || "");
  const moneyHits = (s.match(/\d+(?:\.\d{1,2})?\s*(?:元|块|¥|RMB|rmb)/g) || []).length;
  const consumeWords = /(饭|餐|咖啡|奶茶|外卖|超市|买菜|打车|地铁|火车|机票|房租|水电|电影|游戏|会员|充值|门票|旅行|酒店|工资|报销|退款|红包|转账|购物|淘宝|京东|拼多多|衣服|鞋|数码|手机|耳机)/.test(s);
  if (moneyHits >= 2) return true;
  if (moneyHits >= 1 && consumeWords) return true;
  return false;
}

function extractUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s"'，。）)]+/i);
  return m ? m[0] : null;
}

// 小助手机器人形象：常态呼吸浮动 + 柔光；active（思考/输入中）时动作加快
function AssistantAvatar({ size = 64, active = false }) {
  return (
    <View
      className={`assistant-avatar${active ? " assistant-avatar--active" : ""}`}
      style={{ width: `${size}rpx`, height: `${size}rpx`, flexShrink: 0 }}
    >
      <Image src={assistantAvatarImg} mode="aspectFill" style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

export default function AssistantPage() {
  const seedRef = useRef(Taro.getCurrentInstance().router?.params?.seed || "");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // AI 提案，待确认
  const [creating, setCreating] = useState(false);
  const [scrollInto, setScrollInto] = useState("");
  const [isGuest, setIsGuest] = useState(false);
  // 页眉/输入框实测高度：消息区用固定高度撑满剩余空间，长对话时页眉始终不动
  const [winH] = useState(() => Taro.getSystemInfoSync().windowHeight || 700);
  const [chromeH, setChromeH] = useState({ header: 64, composer: 60 });
  const seededRef = useRef(false);
  const pollRef = useRef(null);
  const lastIdRef = useRef("");
  // 老版本后端（无 /api/companion）自动降级：对话改走旧版 /chat，消息仅本地展示
  const supportedRef = useRef(true);
  const [supported, setSupported] = useState(true);
  const messagesRef = useRef([]);
  const is404 = (err) => /404/.test(err?.message || "");

  // 实测页眉/输入框高度（输入框随多行输入变高，需重测）
  const measureChrome = useCallback(() => {
    Taro.createSelectorQuery()
      .select("#assistant-header")
      .boundingClientRect()
      .exec((res) => {
        const h = res?.[0]?.height;
        if (h) setChromeH((prev) => (prev.header === h ? prev : { ...prev, header: h }));
      });
    Taro.createSelectorQuery()
      .select("#assistant-composer")
      .boundingClientRect()
      .exec((res) => {
        const h = res?.[0]?.height;
        if (h) setChromeH((prev) => (prev.composer === h ? prev : { ...prev, composer: h }));
      });
  }, []);

  useEffect(() => {
    measureChrome();
    const timer = setTimeout(measureChrome, 300);
    return () => clearTimeout(timer);
  }, [measureChrome]);

  // 输入框随多行内容变高，实时重测，保证消息区高度正确、页眉不被顶走
  useEffect(() => {
    measureChrome();
  }, [input, measureChrome]);

  const scrollToBottom = useCallback(() => {
    // 先置空再设置，保证连续新消息也能再次触发滚动
    setScrollInto("");
    setTimeout(() => setScrollInto("chat-bottom"), 60);
  }, []);

  const applyMessages = useCallback((list) => {
    messagesRef.current = list;
    setMessages(list);
    const last = list[list.length - 1];
    if (last) lastIdRef.current = last.id;
  }, []);

  const appendMessage = useCallback((m) => {
    messagesRef.current = [...messagesRef.current, m];
    setMessages(messagesRef.current);
    lastIdRef.current = m.id;
  }, []);

  const markUnsupported = useCallback(() => {
    if (!supportedRef.current) return;
    supportedRef.current = false;
    setSupported(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchHistory = useCallback(async ({ quiet = false } = {}) => {
    if (!supportedRef.current) return;
    try {
      const list = await get("/companion/messages", { limit: 100 }, { silent: true });
      if (!Array.isArray(list)) return;
      if (quiet && list.length && list[list.length - 1].id === lastIdRef.current) return;
      applyMessages(list);
      post("/companion/read", {}, { silent: true }).catch(() => {});
    } catch (err) {
      if (is404(err)) markUnsupported();
      // 其余异常静默：下一轮轮询再试
    }
  }, [applyMessages, markUnsupported]);

  // 降级通道：旧版 /chat 接口（无服务端持久化，消息仅本地）
  const sendViaLegacyChat = async (t, lastExtracted) => {
    const history = messagesRef.current
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-29)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));
    const res = await post("/chat", {
      messages: history,
      last_extracted: lastExtracted || undefined
    }, { silent: true, timeout: 100000 });
    const reply = String(res?.reply || "").trim() || "我在听，你继续说～";
    appendMessage({ id: `local-a-${Date.now()}`, role: "assistant", content: reply, kind: "chat", created_date: new Date().toISOString() });
    setPending(res?.extracted || null);
    scrollToBottom();
    return true;
  };

  // 发送一条用户消息，拿回助手回复与提案
  const sendText = useCallback(async (text, lastExtracted = null) => {
    const t = String(text || "").trim();
    if (!t || busy) return false;
    setBusy(true);
    // 乐观上屏
    const optimistic = { id: `local-${Date.now()}`, role: "user", content: t, kind: "chat", created_date: new Date().toISOString() };
    appendMessage(optimistic);
    scrollToBottom();
    try {
      if (supportedRef.current) {
        try {
          const res = await post("/companion/messages", {
            content: t,
            last_extracted: lastExtracted || undefined
          }, { silent: true, timeout: 100000 });
          if (res?.reply) {
            setMessages((prev) => {
              const next = [...prev.filter((m) => m.id !== optimistic.id), res.message || optimistic, res.reply];
              messagesRef.current = next;
              return next;
            });
            lastIdRef.current = res.reply.id;
          }
          setPending(res?.extracted || null);
          scrollToBottom();
          return true;
        } catch (err) {
          if (!is404(err)) throw err;
          markUnsupported(); // 老后端：降级到旧版 /chat，本次消息走降级通道
        }
      }
      return await sendViaLegacyChat(t, lastExtracted);
    } catch (_err) {
      setMessages((prev) => {
        const next = [
          ...prev.filter((m) => m.id !== optimistic.id),
          optimistic,
          { id: `local-err-${Date.now()}`, role: "assistant", content: "网络好像不太顺…等下再跟我说一次好吗？", kind: "chat", created_date: new Date().toISOString() }
        ];
        messagesRef.current = next;
        return next;
      });
      scrollToBottom();
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, scrollToBottom, appendMessage, markUnsupported]);

  useDidShow(() => {
    setIsGuest(!getToken() || isDemoMode());
    fetchHistory().then(() => {
      // 带着心流页输入的内容进来：作为第一条消息自动发出
      if (!seededRef.current && seedRef.current) {
        seededRef.current = true;
        const seed = decodeURIComponent(seedRef.current);
        seedRef.current = "";
        setTimeout(() => {
          scrollToBottom();
          sendText(seed);
        }, 200);
      } else {
        scrollToBottom();
      }
    });
    pollRef.current = setInterval(() => fetchHistory({ quiet: true }), 10000);
  });

  useDidHide(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  });

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const send = async () => {
    const t = input.trim();
    if (!t) return;
    // 发送成功才清空输入框，失败时保留草稿，用户不用重打
    const ok = await sendText(t, pending);
    if (ok) setInput("");
  };

  // 「不对，再聊聊」：把否定说给 AI，保持对话流畅
  const rejectPending = () => {
    if (!pending || busy) return;
    const last = pending;
    setPending(null);
    sendText("这个不对，我想改一下", last);
  };

  // 提案确认：真正落库（约定/心签/链接/智能规划）
  const confirmCreate = async () => {
    if (!pending || creating) return;
    setCreating(true);
    try {
      let doneLabel = "";
      let planChildCount = 0;
      if (pending.type === "task") {
        const firstUserText = messages.find((m) => m.role === "user")?.content || "";
        await post("/tasks", {
          title: pending.title,
          description: pending.description || firstUserText || undefined,
          category: pending.category || "personal",
          priority: pending.priority || "medium",
          due_at: pending.due_at || undefined
        });
        doneLabel = pending.title;
      } else if (pending.type === "heart") {
        const isLedger = detectLedgerLike(pending.content);
        await post("/notes", {
          title: isLedger ? "账本" : "心签",
          content: pending.content,
          plain_text: pending.content,
          source_type: isLedger ? "ledger" : "emotion",
          tags: isLedger ? ["账本", "心签"] : ["情绪", "心签"]
        });
        doneLabel = isLedger ? "账本" : "心签";
      } else if (pending.type === "link") {
        const url = extractUrl(pending.text) || "";
        await post("/notes", {
          title: pending.text.slice(0, 60).replace(url, "").trim() || "外部链接",
          content: pending.text,
          tags: ["外部信息", "链接"]
        });
        doneLabel = "链接";
      } else if (pending.type === "plan") {
        const pl = pending.plan || {};
        const p = pl.parent || {};
        const children = Array.isArray(pl.children) ? pl.children : [];
        const parentTask = await post("/tasks", {
          title: p.title,
          description: p.description || undefined,
          category: p.category || "personal",
          priority: p.priority || "medium",
          status: "pending"
        });
        const parentId = parentTask?.id || parentTask?.data?.id;
        for (const c of children) {
          await post("/tasks", {
            title: c.title,
            description: c.description || undefined,
            category: p.category || "personal",
            priority: p.priority || "medium",
            parent_task_id: parentId,
            reminder_time: `${c.date}T${c.start_time}:00+08:00`,
            end_time: `${c.date}T${c.end_time}:00+08:00`,
            tags: ["智能规划"]
          }, { silent: true }).catch(() => {});
        }
        Taro.eventCenter.trigger("task:subtasks-changed", { taskId: parentId });
        doneLabel = p.title;
        planChildCount = children.length;
      } else {
        return;
      }
      const echo = planChildCount
        ? `「${doneLabel}」的智能规划已生成 ✓ 共 ${planChildCount} 条子约定排在接下来的日子里，点开母约定可以随时调整～`
        : `「${doneLabel}」已为你记下了 ✓ 还想聊点什么吗？`;
      setPending(null);
      Taro.showToast({ title: "已生成", icon: "success" });
      // 回执落到服务端时间线，重进后这条确认也在（老后端降级时仅本地展示）
      if (supportedRef.current) {
        const res = await post("/companion/messages", { assistant_echo: echo }, { silent: true }).catch(() => null);
        if (res?.message) {
          appendMessage(res.message);
        }
      } else {
        appendMessage({ id: `local-e-${Date.now()}`, role: "assistant", content: echo, kind: "chat", created_date: new Date().toISOString() });
      }
      scrollToBottom();
    } catch (err) {
      Taro.showToast({ title: err?.message || "生成失败，请再试一次", icon: "none" });
    } finally {
      setCreating(false);
    }
  };

  // 语音：按住说话，识别结果直接发出
  const voice = useVoiceRecognition({
    onResult: (t) => {
      const spoken = String(t || "").trim();
      if (spoken) sendText(spoken, pending);
    },
    onError: (err) => Taro.showToast({ title: err || "语音识别失败", icon: "none" })
  });

  const renderProposal = () => {
    if (!pending) return null;
    const pl = pending.type === "plan" ? (pending.plan || {}) : null;
    const children = pl && Array.isArray(pl.children) ? pl.children : [];
    return (
      <View
        style={{
          margin: "0 24rpx 20rpx",
          background: T.card,
          border: `1rpx solid ${T.primaryLight}`,
          borderRadius: "20rpx",
          padding: "24rpx",
          boxShadow: "0 4rpx 16rpx rgba(56,72,119,0.08)"
        }}
      >
        <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10rpx", marginBottom: "12rpx" }}>
          <Text style={{ fontSize: "28rpx" }}>{TYPE_ICON[pending.type] || "✨"}</Text>
          <Text style={{ fontSize: "24rpx", color: T.primary, fontWeight: 600 }}>
            帮你整理好了 · {TYPE_LABEL[pending.type] || "提案"}
          </Text>
        </View>
        {pending.type === "plan" ? (
          <View>
            <Text style={{ display: "block", fontSize: "30rpx", fontWeight: 600, color: T.ink }}>{pl.parent?.title || "智能规划"}</Text>
            <Text style={{ display: "block", marginTop: "8rpx", fontSize: "24rpx", color: T.inkTertiary }}>
              共 {children.length} 条子约定，按天排好具体时刻
            </Text>
          </View>
        ) : (
          <View>
            <Text style={{ display: "block", fontSize: "30rpx", fontWeight: 600, color: T.ink, lineHeight: "42rpx" }}>
              {pending.title || pending.content || pending.text}
            </Text>
            <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "12rpx", marginTop: "10rpx" }}>
              {pending.category ? (
                <Text style={{ fontSize: "22rpx", color: T.inkTertiary }}>{CATEGORY_LABEL[pending.category] || pending.category}</Text>
              ) : null}
              {pending.due_at ? (
                <Text style={{ fontSize: "22rpx", color: T.inkTertiary }}>{fmtTime(pending.due_at)}</Text>
              ) : null}
            </View>
            {pending.description ? (
              <Text style={{ display: "block", marginTop: "8rpx", fontSize: "24rpx", color: T.inkTertiary, lineHeight: "36rpx" }}>
                {pending.description}
              </Text>
            ) : null}
          </View>
        )}
        <View style={{ display: "flex", flexDirection: "row", gap: "16rpx", marginTop: "20rpx" }}>
          <View
            onClick={rejectPending}
            style={{
              flex: 1, height: "72rpx", borderRadius: "36rpx", border: `1rpx solid ${T.border}`,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: "26rpx", color: T.inkTertiary }}>不对，再聊聊</Text>
          </View>
          <View
            onClick={confirmCreate}
            style={{
              flex: 1.4, height: "72rpx", borderRadius: "36rpx", background: T.primary,
              display: "flex", alignItems: "center", justifyContent: "center", opacity: creating ? 0.6 : 1
            }}
          >
            <Text style={{ fontSize: "26rpx", color: "#fff", fontWeight: 600 }}>
              {creating ? "生成中…" : "确认生成"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderMessage = (m) => {
    const mine = m.role === "user";
    const proactive = m.kind === "proactive";
    return (
      <View
        key={m.id}
        id={`msg-${m.id}`}
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: mine ? "flex-end" : "flex-start",
          alignItems: "flex-start",
          marginBottom: "24rpx",
          padding: "0 24rpx"
        }}
      >
        {!mine && (
          <View style={{ marginRight: "16rpx", flexShrink: 0 }}>
            <AssistantAvatar size={64} />
          </View>
        )}
        <View style={{ maxWidth: "76%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
          {proactive && (
            <Text style={{ fontSize: "20rpx", color: T.heart, marginBottom: "6rpx" }}>小助手主动来聊</Text>
          )}
          <View
            style={{
              background: mine ? T.primary : T.card,
              border: mine ? "none" : `1rpx solid ${T.border}`,
              borderRadius: "24rpx",
              borderTopLeftRadius: mine ? "24rpx" : "8rpx",
              borderTopRightRadius: mine ? "8rpx" : "24rpx",
              padding: "20rpx 24rpx"
            }}
          >
            <Text style={{ fontSize: "29rpx", color: mine ? "#fff" : T.ink, lineHeight: "44rpx", wordBreak: "break-all" }}>
              {m.content}
            </Text>
          </View>
          <Text style={{ fontSize: "20rpx", color: T.inkQuaternary, marginTop: "6rpx" }}>{fmtTime(m.created_date)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f5f6fa" }}>
      {/* 头部：小助手身份与「24小时陪伴」状态（固定不动，不随消息滚动） */}
      <View
        id="assistant-header"
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "24rpx 28rpx",
          background: T.card,
          borderBottom: `1rpx solid ${T.border}`
        }}
      >
        <View style={{ marginRight: "18rpx" }}>
          <AssistantAvatar size={76} active={busy} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ display: "block", fontSize: "30rpx", fontWeight: 600, color: T.ink }}>心栈小助手</Text>
          <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8rpx", marginTop: "4rpx" }}>
            <View style={{ width: "12rpx", height: "12rpx", borderRadius: "50%", background: supported ? "#1f9d55" : "#c6c9cf" }} />
            <Text style={{ fontSize: "22rpx", color: T.inkTertiary }}>
              {supported ? "24 小时陪伴中 · 遇到问题会主动找你" : "对话陪伴中 · 云端记忆升级后自动恢复"}
            </Text>
          </View>
        </View>
      </View>

      {/* 消息流（固定高度撑满页眉与输入框之间的空间，页眉不随滚动） */}
      <ScrollView
        scrollY
        style={{ height: `${Math.max(200, winH - chromeH.header - chromeH.composer)}px`, flexShrink: 0 }}
        scrollIntoView={scrollInto}
        scrollWithAnimation
      >
        <View style={{ padding: "24rpx 0" }}>
          {messages.length === 0 && (
            <View>
              <View style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32rpx 0 8rpx" }}>
                <Image
                  src={assistantFullImg}
                  mode="aspectFit"
                  className="assistant-hero"
                  style={{ width: "220rpx", height: "480rpx", borderRadius: "32rpx" }}
                />
              </View>
              {renderMessage({
                id: "welcome",
                role: "assistant",
                kind: "chat",
                content: isGuest
                  ? "你好呀，我是心栈小助手。登录后我会 24 小时陪着你：帮你记约定、记心情，发现该提醒的事也会主动来找你。"
                  : "你好呀，我是心栈小助手，24 小时都在。想记的、想定的、心里放不下的，都可以说给我听；发现需要你拿主意的事，我也会主动来找你。",
                created_date: new Date().toISOString()
              })}
            </View>
          )}
          {messages.map(renderMessage)}
          {busy && (
            <View style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: "0 24rpx 24rpx" }}>
              <View style={{ marginRight: "16rpx", flexShrink: 0 }}>
                <AssistantAvatar size={64} active />
              </View>
              <View style={{ background: T.card, border: `1rpx solid ${T.border}`, borderRadius: "24rpx", borderTopLeftRadius: "8rpx", padding: "20rpx 28rpx" }}>
                <Text style={{ fontSize: "26rpx", color: T.inkQuaternary }}>正在输入…</Text>
              </View>
            </View>
          )}
          {/* AI 提案卡片：确认后才真正落库（随消息流呈现） */}
          {renderProposal()}
          {/* 底部锚点：新消息/提案滚动到此 */}
          <View id="chat-bottom" style={{ height: "2rpx" }} />
        </View>
      </ScrollView>

      {/* 底部聊天框：多行自适应输入 + 语音 + 发送 */}
      <View
        id="assistant-composer"
        style={{
          flexShrink: 0,
          background: "rgba(255,255,255,0.96)",
          borderTop: `1rpx solid ${T.border}`,
          padding: "16rpx 20rpx",
          paddingBottom: "calc(16rpx + env(safe-area-inset-bottom))"
        }}
      >
        {voice.recording && (
          <View style={{ padding: "8rpx 12rpx 16rpx", display: "flex", alignItems: "center" }}>
            <Text style={{ fontSize: "24rpx", color: T.heart }}>🎙 正在聆听…松开手指发送</Text>
          </View>
        )}
        <View style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap: "16rpx" }}>
          <View
            onTouchStart={voice.start}
            onTouchEnd={voice.stop}
            onTouchCancel={voice.stop}
            style={{
              width: "72rpx", height: "72rpx", borderRadius: "50%", flexShrink: 0,
              background: voice.recording ? T.heartBg : T.mist,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: "32rpx" }}>🎙</Text>
          </View>
          <View
            style={{
              flex: 1,
              background: T.mist,
              borderRadius: "24rpx",
              padding: "16rpx 24rpx",
              minHeight: "72rpx",
              display: "flex",
              alignItems: "center"
            }}
          >
            <Textarea
              autoHeight
              fixed
              maxlength={2000}
              cursorSpacing={20}
              value={input}
              onInput={(e) => setInput(e.detail.value)}
              placeholder="和小助手说点什么…"
              placeholderStyle="color:#9ca0a8;font-size:28rpx"
              style={{ width: "100%", fontSize: "29rpx", color: T.ink, lineHeight: "40rpx", maxHeight: "200rpx" }}
              confirmType="send"
              onConfirm={send}
              showConfirmBar={false}
              adjustPosition
              disableDefaultPadding
            />
          </View>
          <View
            onClick={send}
            style={{
              width: "72rpx", height: "72rpx", borderRadius: "50%", flexShrink: 0,
              background: input.trim() ? T.primary : T.border,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: "30rpx", color: "#fff" }}>➤</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
