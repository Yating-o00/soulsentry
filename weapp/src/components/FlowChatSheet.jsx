import { useState, useEffect } from "react";
import { View, Text, Input, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { post } from "@/utils/api";
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

export default function FlowChatSheet({ visible, seedText, onClose, onCreated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // AI 提案，待用户确认
  const [creating, setCreating] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  // 每次打开都是新对话；seed 作为第一条用户消息发出
  useEffect(() => {
    if (!visible) return;
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

  const callAI = async (msgs, lastExtracted) => {
    setBusy(true);
    try {
      const res = await post("/chat", { messages: msgs, last_extracted: lastExtracted }, { silent: true });
      const reply = String(res?.reply || "").trim() || "我在听，你继续说～";
      setMessages([...msgs, { role: "assistant", content: reply }]);
      setPending(res?.extracted || null);
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
        await post("/tasks", {
          title: pending.title,
          description: pending.description || undefined,
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
      setMessages((m) => [...m, { role: "assistant", content: `「${doneLabel}」已为你记下了 ✓ 还想聊点什么吗？` }]);
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
              </View>
            ))}

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
      </View>
    </View>
  );
}
