import { useState, useEffect, useRef } from "react";
import { View, Text, Input, ScrollView, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { post, get } from "@/utils/api";
import { getToken } from "@/utils/auth";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
import theme from "./tasks/theme";

// 首页对话弹层：输入框发送的内容改为进入 AI 对话，
// AI 理解用户想立约定 / 记心签 / 存链接，给出提案卡片，
// 用户确认后才真正生成。AI 不可用时服务端有规则兜底，对话不会中断。
// 底部输入栏与首页主输入栏同构：＋号附件（拍照/照片/文件）+ 长按语音。

const T = theme;
// tasks/theme.js 未包含的色值（与心流页 THEME 保持一致）
const MIST = "#eef0f5";
const HEART = "#e8a5a5";
const HEART_BG = "#fce8ec";

const TYPE_LABEL = { task: "约定", heart: "心签", link: "链接" };
const TYPE_ICON = { task: "🤝", heart: "💌", link: "🔗" };
const CATEGORY_LABEL = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "财务", other: "其他"
};

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const cn = new Date(d.getTime() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${cn.getUTCMonth() + 1}月${cn.getUTCDate()}日 ${pad(cn.getUTCHours())}:${pad(cn.getUTCMinutes())}`;
}

// 与首页 saveHeart 一致的账本签识别
function detectLedgerLike(t) {
  const s = String(t || "");
  if ((s.match(/\d+(?:\.\d{1,2})?\s*(?:元|块|¥)/g) || []).length >= 1) return true;
  const pairs = s.match(/[一-龥]{1,6}\s*[-+]?\d+(?:\.\d{1,2})?(?!\d)/g) || [];
  return pairs.length >= 2;
}

function extractUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s"'，。）)]+/i);
  return m ? m[0] : null;
}

// /uploads/ 相对路径 → 完整图片地址（小助手截图预览用）
function resolveUploadUrl(p) {
  if (!p) return "";
  if (/^https?:\/\//.test(p)) return p;
  const rawApi = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";
  const host = rawApi.replace(/\/$/, "").replace(/\/api$/, "");
  return `${host}${p}`;
}

// ws(s) 地址推导：与 API 同源，路径 /ws/agent-stream
function resolveWsUrl(executionId, token) {
  const rawApi = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";
  const host = rawApi.replace(/\/$/, "").replace(/\/api$/, "").replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  return `${host}/ws/agent-stream?token=${encodeURIComponent(token || "")}&executionId=${encodeURIComponent(executionId)}`;
}

// 请求超时保护：任何情况下都不能让「正在输入」永远转下去
function withTimeout(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), ms))
  ]);
}

export default function FlowChatSheet({ visible, seedText, onClose, onCreated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // AI 提案，待用户确认
  const [creating, setCreating] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  // —— 浏览器小助手（对话内嵌 Agent）：agentExecId 非空时轮询执行状态 ——
  const [agentExecId, setAgentExecId] = useState(null);
  const [agentStatus, setAgentStatus] = useState("");
  const [agentShot, setAgentShot] = useState("");
  const [agentTakeover, setAgentTakeover] = useState(false);
  const [takeoverText, setTakeoverText] = useState("");
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveFrame, setLiveFrame] = useState("");
  const [liveNotice, setLiveNotice] = useState("正在连接…");
  const [liveText, setLiveText] = useState("");
  const liveSocketRef = useRef(null);
  const liveRectRef = useRef(null);
  const lastMoveRef = useRef(0);
  const agentPollRef = useRef(null);
  const lastAskedRef = useRef("");

  const stopAgentPoll = () => {
    if (agentPollRef.current) {
      clearInterval(agentPollRef.current);
      agentPollRef.current = null;
    }
  };

  // 每次打开都是新对话；seed 作为第一条用户消息发出
  useEffect(() => {
    if (!visible) return;
    stopAgentPoll();
    setAgentExecId(null);
    setAgentStatus("");
    setMessages([]);
    setPending(null);
    setInput("");
    setSessionKey((k) => k + 1);
    const seed = String(seedText || "").trim();
    if (seed) {
      const first = [{ role: "user", content: seed }];
      setMessages(first);
      callAI(first, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 关闭/卸载时停掉轮询与实时窗口（Agent 本身继续在服务端执行，守护记录里可看）
  useEffect(() => {
    if (!visible) {
      stopAgentPoll();
      setAgentShot("");
      setAgentTakeover(false);
      try { liveSocketRef.current?.close({}); } catch {}
      liveSocketRef.current = null;
      setLiveOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // —— 浏览器小助手：启动后轮询执行状态，提问与结果回落到对话里 ——
  const pushAssistant = (content, extra = {}) => {
    setMessages((m) => [...m, { role: "assistant", content, ...extra }]);
  };

  const startAgent = (executionId) => {
    stopAgentPoll();
    setAgentExecId(executionId);
    lastAskedRef.current = "";
    setAgentShot("");
    setAgentTakeover(false);
    setAgentStatus("正在打开网页…");
    agentPollRef.current = setInterval(() => pollAgent(executionId), 2500);
  };

  const finishAgent = (finalMessage) => {
    stopAgentPoll();
    setAgentExecId(null);
    setAgentStatus("");
    setAgentShot("");
    setAgentTakeover(false);
    if (finalMessage) pushAssistant(finalMessage, { agent: true });
  };

  // —— 接管模式：把用户的点按/输入转发到真实浏览器 ——
  const agentCommand = async (cmd) => {
    if (!agentExecId) return;
    try {
      await post(`/task-executions/${agentExecId}/agent-command`, { cmd }, { silent: true });
    } catch (_e) { /* 指令失败由下一轮轮询兜底 */ }
  };

  // 小程序 tap 事件的 detail.x/y 相对被点元素（px）；图片宽度 440rpx，等比缩放
  const onShotTap = (e) => {
    const { x, y } = e.detail || {};
    if (x === undefined || y === undefined) return;
    const win = Taro.getSystemInfoSync().windowWidth || 375;
    const widthPx = 440 * win / 750;
    const scale = 1280 / widthPx;
    agentCommand({ type: "click", x: Math.round(x * scale), y: Math.round(y * scale) });
  };

  const sendTakeoverText = () => {
    const t = takeoverText.trim();
    if (!t) return;
    setTakeoverText("");
    agentCommand({ type: "type", text: t });
  };

  const releaseAgent = async () => {
    if (!agentExecId) return;
    try {
      await post(`/task-executions/${agentExecId}/agent-release`, { note: "我自己操作好了" }, { silent: true });
    } catch (_e) { /* 轮询会同步最终状态 */ }
  };

  // —— 实时窗口（Muse 式接管）：视频流帧 + 触摸/输入实时转发 ——
  const openLive = () => {
    if (!agentExecId || liveSocketRef.current) return;
    const socket = Taro.connectSocket({ url: resolveWsUrl(agentExecId, getToken()) });
    liveSocketRef.current = socket;
    setLiveNotice("正在连接…");
    socket.onOpen(() => setLiveNotice("已接管：小助手原地待命，你的操作实时生效"));
    socket.onMessage((res) => {
      try {
        const msg = JSON.parse(res.data);
        if (msg.type === "frame") setLiveFrame(msg.data);
        else if (msg.type === "ready") setLiveNotice("已接管：小助手原地待命，你的操作实时生效");
        else if (msg.type === "ended") setLiveNotice("小助手已结束本次任务");
        else if (msg.type === "error") setLiveNotice(msg.message || "连接异常");
      } catch {}
    });
    socket.onClose(() => { liveSocketRef.current = null; setLiveOpen(false); setLiveFrame(""); });
    socket.onError(() => { setLiveNotice("连接异常，请关闭重试"); });
    setLiveOpen(true);
    setTimeout(() => {
      Taro.createSelectorQuery().select("#live-stage").boundingClientRect((rect) => {
        if (rect) liveRectRef.current = rect;
      }).exec();
    }, 300);
  };

  const closeLive = () => {
    try { liveSocketRef.current?.close({}); } catch {}
    liveSocketRef.current = null;
    setLiveOpen(false);
    setLiveFrame("");
  };

  const liveSend = (obj) => {
    const s = liveSocketRef.current;
    if (s) s.send({ data: JSON.stringify(obj) });
  };

  const toViewport = (e) => {
    const rect = liveRectRef.current;
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!rect || !t) return null;
    return { x: Math.round((t.clientX - rect.left) * 1280 / rect.width), y: Math.round((t.clientY - rect.top) * 800 / rect.height) };
  };

  const liveTouchStart = (e) => { const p = toViewport(e); if (p) liveSend({ type: "mousedown", ...p }); };
  const liveTouchMove = (e) => {
    const now = Date.now();
    if (now - lastMoveRef.current < 40) return;
    lastMoveRef.current = now;
    const p = toViewport(e);
    if (p) liveSend({ type: "mousemove", ...p });
  };
  const liveTouchEnd = (e) => { const p = toViewport(e); if (p) liveSend({ type: "mouseup", ...p }); };

  const pollAgent = async (executionId) => {
    try {
      const st = await get(`/task-executions/${executionId}/agent-state`, {}, { silent: true });
      if (!st) return;
      if (st.latestScreenshot) setAgentShot(st.latestScreenshot);
      if (st.active) {
        if (st.status === "takeover") {
          setAgentTakeover(true);
          setAgentStatus("正在由你亲自操作网页");
        } else if (agentTakeover) {
          setAgentTakeover(false);
        }
        if (st.status === "waiting_input" && st.waiting?.question) {
          setAgentStatus("等你回应");
          if (st.waiting.question !== lastAskedRef.current) {
            lastAskedRef.current = st.waiting.question;
            pushAssistant(st.waiting.question, { agent: true, choices: st.waiting.choices || [] });
          }
        } else if (st.status === "failed" || st.error) {
          finishAgent(`小助手这边卡住了${st.error ? `：${st.error}` : ""}。别担心，打开守护记录可以查看全过程，也能点「再试一次」～`);
        } else {
          const stepCount = Array.isArray(st.steps) ? st.steps.length : 0;
          setAgentStatus(stepCount > 0 ? `正在操作网页（已进行 ${stepCount} 步）…` : "正在打开网页…");
        }
      } else if (st.execution_status === "completed") {
        const summary = st.automation_result?.data?.agent?.summary || st.automation_result?.preview || "";
        finishAgent(summary ? `办好啦：${summary}` : "这件事办好了，详细过程在守护记录里可以看～");
      } else if (st.execution_status === "failed") {
        finishAgent(`小助手没能完成这件事${st.automation_result?.errorMessage ? `：${st.automation_result.errorMessage}` : ""}。打开守护记录可以「再试一次」～`);
      }
    } catch (_e) {
      // 轮询失败不打断对话，下一轮继续
    }
  };

  const callAI = async (msgs, lastExtracted) => {
    setBusy(true);
    try {
      const res = await withTimeout(post("/chat", {
        messages: msgs,
        last_extracted: lastExtracted,
        agent_execution_id: agentExecId || undefined
      }, { silent: true }));
      const reply = String(res?.reply || "").trim() || "我在听，你继续说～";
      setMessages([...msgs, { role: "assistant", content: reply }]);
      setPending(res?.extracted || null);
      // 后端派出了浏览器小助手：进入 Agent 模式轮询
      if (res?.agent?.executionId && res.agent.executionId !== agentExecId) {
        startAgent(res.agent.executionId);
      }
    } catch (_err) {
      setMessages([...msgs, { role: "assistant", content: "刚才走神了一下…你再说一遍好吗？" }]);
    } finally {
      setBusy(false);
    }
  };

  const send = (raw) => {
    const t = String(raw !== undefined ? raw : input).trim();
    if (!t || busy) return;
    const msgs = [...messages, { role: "user", content: t }];
    setMessages(msgs);
    setInput("");
    callAI(msgs, pending);
  };

  // 「不对，再聊聊」：把否定说给 AI，由 AI 温柔引导用户说出要改什么，
  // 保持对话流畅，而不是工具化地直接收起卡片
  const rejectPending = () => {
    if (!pending || busy) return;
    const last = pending;
    setPending(null);
    const msgs = [...messages, { role: "user", content: "这个不对，我想改一下" }];
    setMessages(msgs);
    callAI(msgs, last);
  };

  const confirmCreate = async () => {
    if (!pending || creating) return;
    setCreating(true);
    try {
      let doneLabel = "";
      if (pending.type === "task") {
        // 详情保底：AI 未返回 description 时，用首条用户输入（通常是语音原文）作为约定详情
        const firstUserText = messages.find((m) => m.role === "user")?.content || "";
        await post("/tasks", {
          title: pending.title,
          description: pending.description || firstUserText || undefined,
          category: pending.category || "personal",
          priority: pending.priority || "medium",
          due_at: pending.due_at || undefined
        }, { silent: true });
        doneLabel = pending.title;
      } else if (pending.type === "heart") {
        const isLedger = detectLedgerLike(pending.content);
        await post("/notes", {
          title: isLedger ? "账本" : "心签",
          content: pending.content,
          plain_text: pending.content,
          source_type: isLedger ? "ledger" : "emotion",
          tags: isLedger ? ["账本", "心签"] : ["情绪", "心签"]
        }, { silent: true });
        doneLabel = isLedger ? "账本" : "心签";
      } else if (pending.type === "link") {
        const url = extractUrl(pending.text) || "";
        await post("/notes", {
          title: pending.text.slice(0, 60).replace(url, "").trim() || "外部链接",
          content: pending.text,
          tags: ["外部信息", "链接"]
        }, { silent: true });
        doneLabel = "链接";
      } else {
        return;
      }
      const isBrowserTask = pending.type === "task" && /https?:\/\//i.test(pending.description || messages.find((m) => m.role === "user")?.content || "");
      setMessages((m) => [...m, { role: "assistant", content: isBrowserTask ? `「${doneLabel}」已为你记下了 ✓ 浏览器小助手开始帮你办这件事，进度和结果在守护记录里随时看～` : `「${doneLabel}」已为你记下了 ✓ 还想聊点什么吗？` }]);
      setPending(null);
      onCreated?.();
    } catch (err) {
      Taro.showToast({ title: err?.message || "生成失败，请再试一次", icon: "none" });
    } finally {
      setCreating(false);
    }
  };

  // 语音：长按说话，松手识别后直接作为一条消息发给 AI
  const voice = useVoiceRecognition({
    onResult: (t) => {
      const spoken = String(t || "").trim();
      if (spoken) send(spoken);
    },
    onError: (err) => Taro.showToast({ title: err || "语音识别失败", icon: "none" })
  });

  // 附件：与首页主输入栏同一套能力
  const uploadFileToServer = async (filePath) => {
    const token = getToken();
    const rawApi = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";
    const apiBase = rawApi.replace(/\/$/, "");
    const uploadUrl = apiBase.endsWith("/api") ? `${apiBase}/uploads` : `${apiBase}/api/uploads`;
    const uploadRes = await Taro.uploadFile({
      url: uploadUrl,
      filePath,
      name: "file",
      header: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 60000
    });
    const data = JSON.parse(uploadRes.data || "{}");
    if (!(uploadRes.statusCode >= 200 && uploadRes.statusCode < 300 && data.file_url)) {
      throw new Error(data?.message || "上传失败");
    }
    return data.file_url;
  };

  // 拍照/相册图片：上传识别后，把识别文本作为用户消息发给 AI 继续对话
  const attachImage = (sourceType) => {
    Taro.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType,
      sizeType: ["compressed"],
      success: async (res) => {
        const file = res.tempFiles?.[0];
        if (!file?.tempFilePath) return;
        Taro.showLoading({ title: "上传中" });
        try {
          const fileUrl = await uploadFileToServer(file.tempFilePath);
          Taro.showLoading({ title: "识别中" });
          const draft = await post("/functions/analyzeImage", { file_url: fileUrl }, { silent: true, timeout: 120000 });
          const text = String(draft?.extracted_text || "").trim();
          if (!text) {
            Taro.showToast({ title: "没识别出文字，换个方式试试", icon: "none" });
            return;
          }
          send(`我发了张图片，识别出来的内容是：${text.slice(0, 400)}`);
        } catch (err) {
          Taro.showToast({ title: err?.message || "识别失败，请手动输入", icon: "none" });
        } finally {
          Taro.hideLoading();
        }
      },
      fail: () => {}
    });
  };

  // 上传文件：直接存入记录（与首页主输入栏行为一致）
  const attachFile = () => {
    Taro.chooseMessageFile({
      count: 1,
      type: "all",
      success: async (res) => {
        const file = res.tempFiles?.[0];
        if (!file?.path) return;
        Taro.showLoading({ title: "上传中" });
        try {
          const fileUrl = await uploadFileToServer(file.path);
          const name = file.name || "未命名文件";
          await post("/notes", {
            title: `📎 ${name}`.slice(0, 60),
            content: `📎 文件：${name}\n${fileUrl}`,
            plain_text: `📎 ${name}`,
            tags: ["文件"]
          }, { silent: true });
          Taro.showToast({ title: "文件已存入记录", icon: "success" });
          onCreated?.();
        } catch (err) {
          Taro.showToast({ title: err?.message || "上传失败", icon: "none" });
        } finally {
          Taro.hideLoading();
        }
      },
      fail: () => {}
    });
  };

  const handleAttach = () => {
    Taro.showActionSheet({
      itemList: ["拍照", "上传照片", "上传文件"],
      success: (r) => {
        if (r.tapIndex === 0) attachImage(["camera"]);
        else if (r.tapIndex === 1) attachImage(["album"]);
        else attachFile();
      },
      fail: () => {}
    });
  };

  const handleClose = () => {
    if (voice.recording) voice.stop();
    onClose?.();
  };

  if (!visible) return null;

  const lastId = messages.length ? `m${sessionKey}-${messages.length - 1}` : undefined;

  return (
    <View
      style={{
        position: "fixed",
        top: "6%",
        left: "24rpx",
        right: "24rpx",
        height: "84vh",
        zIndex: 999
      }}
    >
      <View
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: "28rpx",
          overflow: "hidden",
          boxShadow: "0 24rpx 64rpx rgba(30,40,60,0.28)"
        }}
      >
        {/* 头部 */}
        <View
          style={{
            padding: "24rpx 28rpx 18rpx",
            borderBottom: `1rpx solid ${T.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <View>
            <Text style={{ fontSize: "30rpx", fontWeight: 500, color: T.ink }}>和心栈聊聊</Text>
            <Text style={{ fontSize: "20rpx", color: T.inkQuaternary, marginTop: "4rpx", display: "block" }}>
              想记住的事，说给我听，我会替你整理好
            </Text>
          </View>
          <View
            onClick={handleClose}
            style={{
              width: "56rpx",
              height: "56rpx",
              borderRadius: "50%",
              background: T.paper,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: "30rpx", color: T.inkTertiary }}>✕</Text>
          </View>
        </View>

        {/* 对话列表 */}
        <ScrollView scrollY style={{ flex: 1, minHeight: 0 }} scrollIntoView={lastId} scrollWithAnimation>
          <View style={{ padding: "24rpx 24rpx 12rpx", display: "flex", flexDirection: "column" }}>
            {messages.map((m, i) => (
              <View
                key={`m${sessionKey}-${i}`}
                id={`m${sessionKey}-${i}`}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  padding: "16rpx 22rpx",
                  borderRadius: m.role === "user" ? "24rpx 24rpx 6rpx 24rpx" : "24rpx 24rpx 24rpx 6rpx",
                  background: m.role === "user" ? T.primary : T.paper,
                  marginBottom: "18rpx"
                }}
              >
                <Text style={{ fontSize: "28rpx", lineHeight: "42rpx", color: m.role === "user" ? "#fff" : T.ink, wordBreak: "break-all" }}>
                  {m.content}
                </Text>
                {/* 小助手提问附带的可点选项：点击即以用户身份发送 */}
                {m.role === "assistant" && Array.isArray(m.choices) && m.choices.length > 0 && (
                  <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", marginTop: "14rpx" }}>
                    {m.choices.map((c) => (
                      <View
                        key={c}
                        onClick={() => send(c)}
                        style={{ padding: "8rpx 22rpx", borderRadius: "999rpx", border: "1px solid rgba(56,72,119,0.35)", background: "rgba(56,72,119,0.06)", marginRight: "12rpx", marginBottom: "10rpx" }}
                      >
                        <Text style={{ fontSize: "24rpx", color: T.primary }}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {/* 小助手执行状态条 + 实时网页画面 / 接管操作台 */}
            {agentExecId && (
              <View style={{ alignSelf: "flex-start", marginBottom: "18rpx" }}>
                {agentStatus && (
                  <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", padding: "10rpx 22rpx", borderRadius: "999rpx", background: "rgba(56,72,119,0.07)", marginBottom: "12rpx" }}>
                    <Text style={{ fontSize: "22rpx", color: T.primary }}>● {agentStatus}</Text>
                  </View>
                )}
                {agentShot && (
                  <Image
                    src={resolveUploadUrl(agentShot)}
                    mode="widthFix"
                    onClick={agentTakeover ? onShotTap : () => Taro.previewImage({ urls: [resolveUploadUrl(agentShot)] })}
                    style={{ width: "440rpx", borderRadius: "16rpx", border: "1px solid rgba(15,23,42,0.10)" }}
                  />
                )}
                {!liveOpen && (
                  <View onClick={openLive} style={{ alignSelf: "flex-start", padding: "10rpx 24rpx", borderRadius: "999rpx", background: T.primary, marginTop: "4rpx" }}>
                    <Text style={{ fontSize: "22rpx", color: "#fff" }}>🖥️ 打开实时窗口，亲自操作网页</Text>
                  </View>
                )}
                {agentTakeover && (
                  <View style={{ width: "440rpx", marginTop: "12rpx", padding: "16rpx", borderRadius: "16rpx", border: "1px solid rgba(15,23,42,0.10)", background: "#fbfcfc" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: "12rpx" }}>
                      <Input
                        value={takeoverText}
                        onInput={(e) => setTakeoverText(e.detail.value)}
                        placeholder="输入文字…"
                        style={{ flex: 1, fontSize: "24rpx", padding: "8rpx 16rpx", borderRadius: "10rpx", border: "1px solid rgba(15,23,42,0.10)", marginRight: "10rpx" }}
                      />
                      <View onClick={sendTakeoverText} style={{ padding: "8rpx 18rpx", borderRadius: "10rpx", background: T.primary, marginRight: "10rpx" }}>
                        <Text style={{ fontSize: "22rpx", color: "#fff" }}>输入</Text>
                      </View>
                      <View onClick={() => agentCommand({ type: "key", key: "Enter" })} style={{ padding: "8rpx 18rpx", borderRadius: "10rpx", border: "1px solid rgba(15,23,42,0.15)" }}>
                        <Text style={{ fontSize: "22rpx", color: T.inkTertiary }}>回车</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View onClick={() => agentCommand({ type: "scroll", direction: "up" })} style={{ flex: 1, padding: "8rpx", borderRadius: "10rpx", border: "1px solid rgba(15,23,42,0.15)", alignItems: "center", marginRight: "10rpx" }}>
                        <Text style={{ fontSize: "22rpx", color: T.inkTertiary }}>上滑</Text>
                      </View>
                      <View onClick={() => agentCommand({ type: "scroll", direction: "down" })} style={{ flex: 1, padding: "8rpx", borderRadius: "10rpx", border: "1px solid rgba(15,23,42,0.15)", alignItems: "center", marginRight: "10rpx" }}>
                        <Text style={{ fontSize: "22rpx", color: T.inkTertiary }}>下滑</Text>
                      </View>
                      <View onClick={releaseAgent} style={{ flex: 2, padding: "8rpx", borderRadius: "10rpx", background: "rgba(56,72,119,0.08)", alignItems: "center" }}>
                        <Text style={{ fontSize: "22rpx", color: T.primary }}>交还小助手 →</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            {busy && (
              <View style={{ alignSelf: "flex-start", padding: "14rpx 22rpx", borderRadius: "24rpx 24rpx 24rpx 6rpx", background: T.paper, marginBottom: "18rpx" }}>
                <Text style={{ fontSize: "26rpx", color: T.inkQuaternary }}>正在输入…</Text>
              </View>
            )}

            {/* 提案卡片：确认后才生成 */}
            {pending && !busy && (
              <View
                style={{
                  alignSelf: "stretch",
                  borderRadius: "20rpx",
                  border: `1rpx solid ${T.border}`,
                  background: "#fbfcfc",
                  padding: "22rpx 24rpx",
                  marginBottom: "18rpx"
                }}
              >
                <View style={{ display: "flex", alignItems: "center", marginBottom: "14rpx" }}>
                  <Text style={{ fontSize: "26rpx", marginRight: "10rpx" }}>{TYPE_ICON[pending.type] || "📝"}</Text>
                  <Text style={{ fontSize: "24rpx", fontWeight: 500, color: T.primary }}>
                    将要生成{TYPE_LABEL[pending.type] || "记录"}
                  </Text>
                </View>

                {pending.type === "task" && (
                  <>
                    <Text style={{ fontSize: "30rpx", fontWeight: 500, color: T.ink, wordBreak: "break-all" }}>{pending.title}</Text>
                    {(pending.description || messages.find((m) => m.role === "user")?.content) && (
                      <Text style={{ fontSize: "22rpx", color: T.inkTertiary, lineHeight: "34rpx", marginTop: "8rpx", wordBreak: "break-all" }}>
                        {(pending.description || messages.find((m) => m.role === "user")?.content || "").slice(0, 50)}
                      </Text>
                    )}
                    <View style={{ display: "flex", flexWrap: "wrap", marginTop: "12rpx" }}>
                      {pending.due_at && (
                        <View style={{ padding: "4rpx 14rpx", borderRadius: "8rpx", background: MIST, marginRight: "10rpx", marginBottom: "8rpx" }}>
                          <Text style={{ fontSize: "20rpx", color: T.primary }}>🕐 {fmtTime(pending.due_at)}</Text>
                        </View>
                      )}
                      {pending.category && (
                        <View style={{ padding: "4rpx 14rpx", borderRadius: "8rpx", background: T.paper, marginRight: "10rpx", marginBottom: "8rpx" }}>
                          <Text style={{ fontSize: "20rpx", color: T.inkTertiary }}>{CATEGORY_LABEL[pending.category] || pending.category}</Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
                {pending.type === "heart" && (
                  <Text style={{ fontSize: "26rpx", color: T.ink, lineHeight: "40rpx", wordBreak: "break-all" }}>{pending.content}</Text>
                )}
                {pending.type === "link" && (
                  <Text style={{ fontSize: "24rpx", color: T.inkTertiary, lineHeight: "38rpx", wordBreak: "break-all" }}>{pending.text}</Text>
                )}

                <View style={{ display: "flex", alignItems: "center", marginTop: "18rpx" }}>
                  <View
                    onClick={confirmCreate}
                    style={{
                      padding: "14rpx 34rpx",
                      borderRadius: "999rpx",
                      background: creating ? T.border : T.primary
                    }}
                  >
                    <Text style={{ fontSize: "26rpx", fontWeight: 500, color: "#fff" }}>
                      {creating ? "生成中…" : "确认生成"}
                    </Text>
                  </View>
                  <View onClick={rejectPending} style={{ padding: "14rpx 24rpx", marginLeft: "8rpx" }}>
                    <Text style={{ fontSize: "24rpx", color: T.inkQuaternary }}>不对，再聊聊</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* 录音提示：弹层内部渲染，不用 fixed 定位 */}
        {voice.recording && (
          <View style={{ padding: "0 24rpx 12rpx" }}>
            <View
              style={{
                padding: "16rpx 24rpx",
                borderRadius: "16rpx",
                background: "rgba(28,28,30,0.86)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Text style={{ fontSize: "26rpx", color: "#fff" }}>
                🎙️ {voice.hint || "正在聆听…松开手指即发送"}
              </Text>
            </View>
          </View>
        )}

        {/* 输入行：与首页主输入栏同构（＋附件 / 输入 / 发送 / 长按语音） */}
        <View style={{ padding: "16rpx 24rpx", borderTop: `1rpx solid ${T.border}` }}>
          <View
            onLongPress={voice.start}
            onTouchEnd={voice.stop}
            onTouchCancel={voice.stop}
            style={{
              display: "flex",
              alignItems: "center",
              background: voice.recording ? HEART_BG : T.paper,
              borderRadius: "40rpx",
              padding: "6rpx 6rpx 6rpx 20rpx",
              border: `1rpx solid ${voice.recording ? HEART : T.border}`
            }}
          >
            <View
              onClick={handleAttach}
              style={{
                width: "56rpx",
                height: "56rpx",
                borderRadius: "50%",
                background: MIST,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginRight: "12rpx"
              }}
            >
              <Text style={{ fontSize: "40rpx", color: T.primary, lineHeight: "48rpx" }}>＋</Text>
            </View>
            <Input
              style={{ flex: 1, fontSize: "28rpx", color: T.ink, height: "60rpx" }}
              placeholder={voice.recording ? "正在聆听…松开手指即可" : "直接输入，或长按语音"}
              value={input}
              confirmType="send"
              onInput={(e) => setInput(e.detail.value)}
              onConfirm={() => send()}
            />
            <View
              onClick={() => send()}
              style={{
                width: "60rpx",
                height: "60rpx",
                borderRadius: "50%",
                background: input.trim() ? T.primary : T.border,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginLeft: "12rpx"
              }}
            >
              <Text style={{ fontSize: "30rpx", color: "#fff" }}>➤</Text>
            </View>
          </View>
        </View>

        {/* 实时浏览器窗口：视频流帧 + 触摸操作实时转发，关闭即交还小助手 */}
        {liveOpen && (
          <View style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, background: "rgba(2,6,23,0.96)", zIndex: 999, display: "flex", flexDirection: "column", padding: "24rpx" }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: "16rpx" }}>
              <Text style={{ flex: 1, fontSize: "24rpx", color: "#e2e8f0" }} numberOfLines={1}>{liveNotice}</Text>
              <View onClick={closeLive} style={{ padding: "10rpx 28rpx", borderRadius: "999rpx", background: "#10b981" }}>
                <Text style={{ fontSize: "24rpx", color: "#fff" }}>交还小助手</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: "16rpx" }}>
              <Input
                value={liveText}
                onInput={(e) => setLiveText(e.detail.value)}
                placeholder="打字从这里送入网页…"
                style={{ flex: 1, fontSize: "24rpx", color: "#e2e8f0", background: "rgba(255,255,255,0.06)", borderRadius: "999rpx", padding: "10rpx 24rpx" }}
              />
              <View onClick={() => { const t = liveText.trim(); if (t) { setLiveText(""); liveSend({ type: "type", text: t }); } }} style={{ padding: "10rpx 24rpx", borderRadius: "999rpx", background: "#e2e8f0", marginLeft: "12rpx" }}>
                <Text style={{ fontSize: "22rpx", color: "#0f172a" }}>发送文字</Text>
              </View>
              <View onClick={() => liveSend({ type: "keydown", key: "Enter" })} style={{ padding: "10rpx 24rpx", borderRadius: "999rpx", border: "1px solid rgba(255,255,255,0.2)", marginLeft: "12rpx" }}>
                <Text style={{ fontSize: "22rpx", color: "#e2e8f0" }}>回车</Text>
              </View>
            </View>

            <View style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {liveFrame ? (
                <Image
                  id="live-stage"
                  src={liveFrame}
                  mode="widthFix"
                  style={{ width: "100%", borderRadius: "16rpx" }}
                  onTouchStart={liveTouchStart}
                  onTouchMove={liveTouchMove}
                  onTouchEnd={liveTouchEnd}
                  onTouchCancel={liveTouchEnd}
                />
              ) : (
                <View style={{ padding: "60rpx 0" }}>
                  <Text style={{ fontSize: "24rpx", color: "#64748b" }}>等待画面…（小助手执行中也会实时显示）</Text>
                </View>
              )}
            </View>

            <Text style={{ fontSize: "20rpx", color: "#64748b", textAlign: "center", marginTop: "12rpx" }}>
              点击/滑动画面即操作真实网页 · 登录、滑块、付款都可以亲手完成
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
