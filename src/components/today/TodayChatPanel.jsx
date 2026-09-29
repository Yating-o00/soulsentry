import React, { useState, useEffect, useRef } from "react";
import { Loader2, ArrowUp, Mic, X } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { base44 } from "@/api/base44Client";

// 今日页内嵌对话面板：输入框发送的内容直接进入这里的连续对话，
// AI 理解意图后给出提案卡（约定/心签/链接），用户确认后才真正生成；
// 信息不足时 AI 主动追问（通常问时间）。与小程序心流页同一后端 /api/chat。

// 颜色全部内联、不依赖 .today-page 作用域的 CSS 变量，避免白底白字。
const C = {
  sentinel: "#384877",
  sentinelDeep: "#2a3659",
  ink: "#0f172a",
  ink3: "#64748b",
  ink4: "#94a3b8",
  mist: "#f1f5f9",
  hairline: "rgba(15,23,42,0.10)",
  recordingBg: "#fce8ec",
  recordingBorder: "#e8a5a5",
};

const TYPE_LABEL = { task: "约定", heart: "心签", link: "链接" };
const TYPE_ICON = { task: "🤝", heart: "💌", link: "🔗" };
const CATEGORY_LABEL = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "财务", other: "其他"
};

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 与心流页 saveHeart 一致的账本签识别
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

export default function TodayChatPanel({ seedText, seedNonce, onClose, onCreated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // AI 提案，待用户确认
  const [creating, setCreating] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  // seedNonce 变化 = 开启新一轮对话；seed 作为第一条用户消息发出
  useEffect(() => {
    setMessages([]);
    setPending(null);
    setInput("");
    setSessionKey((k) => k + 1);
    const seed = String(seedText || "").trim();
    if (seed) {
      const first = [{ role: "user", content: seed.slice(0, 500) }];
      setMessages(first);
      callAI(first, null);
    }
    return () => {
      try { recognitionRef.current?.stop?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  // 新消息/提案出现时滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, pending]);

  const callAI = async (msgs, lastExtracted) => {
    setBusy(true);
    try {
      const res = await httpRequest("/api/chat", {
        method: "POST",
        body: { messages: msgs, last_extracted: lastExtracted }
      });
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
    const msgs = [...messages, { role: "user", content: t.slice(0, 500) }];
    setMessages(msgs);
    setInput("");
    callAI(msgs, pending);
  };

  // 「不对，再聊聊」：把否定说给 AI，由 AI 温柔引导用户说出要改什么
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
      // 详情保底：AI 未返回 description 时，用首条用户输入作为约定详情
      const firstUserText = messages.find((m) => m.role === "user")?.content || "";
      if (pending.type === "task") {
        await base44.entities.Task.create({
          title: pending.title,
          description: pending.description || firstUserText || "",
          category: pending.category || "personal",
          priority: pending.priority || "medium",
          status: "pending",
          due_at: pending.due_at || null,
          reminder_time: pending.due_at || null,
        });
        doneLabel = pending.title;
      } else if (pending.type === "heart") {
        const isLedger = detectLedgerLike(pending.content);
        const note = await base44.entities.Note.create({
          title: isLedger ? "账本" : "心签",
          content: pending.content,
          plain_text: pending.content,
          source_type: isLedger ? "ledger" : "emotion",
          tags: isLedger ? ["账本", "心签"] : ["情绪", "心签"],
        });
        doneLabel = isLedger ? "账本" : "心签";
        // 触发 AI 温暖回应（与心签页同一链路）
        try {
          base44.functions.invoke("analyzeHeartSign", {
            note_id: note.id,
            note_data: { plain_text: note.plain_text ?? pending.content, content: note.content ?? pending.content, tags: note.tags },
          }).catch((e) => console.warn("analyzeHeartSign skipped:", e?.message));
        } catch (e) {
          console.warn("analyzeHeartSign invoke failed:", e?.message);
        }
      } else if (pending.type === "link") {
        const url = extractUrl(pending.text) || "";
        await base44.entities.Note.create({
          title: pending.text.slice(0, 60).replace(url, "").trim() || "外部链接",
          content: pending.text,
          plain_text: pending.text,
          tags: ["外部信息", "链接"],
        });
        doneLabel = "链接";
      } else {
        return;
      }
      const isBrowserTask = pending.type === "task" && /https?:\/\//i.test(pending.description || firstUserText);
      setMessages((m) => [...m, { role: "assistant", content: isBrowserTask ? `「${doneLabel}」已为你记下了 ✓ 浏览器小助手开始帮你办这件事，进度和结果在守护记录里随时看～` : `「${doneLabel}」已为你记下了 ✓ 还想聊点什么吗？` }]);
      onCreated?.({ type: pending.type, label: doneLabel });
      setPending(null);
    } catch (err) {
      toast.error(err?.message || "生成失败，请再试一次");
    } finally {
      setCreating(false);
    }
  };

  // —— 长按语音：按住说话，松开识别并发送 ——
  const startVoice = () => {
    if (recording) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.info("当前浏览器不支持语音输入");
      return;
    }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.continuous = false;
    rec.interimResults = false;
    recognitionRef.current = rec;
    rec.onstart = () => setRecording(true);
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript || "";
      if (t.trim()) send(t.trim());
    };
    try { rec.start(); } catch {}
  };

  const stopVoice = () => {
    try { recognitionRef.current?.stop?.(); } catch {}
    setRecording(false);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: C.hairline }}>
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: C.hairline }}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium" style={{ color: C.ink }}>和心栈聊聊</span>
          <span className="text-[11px]" style={{ color: C.ink4 }}>确认后才会生成</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="收起对话"
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]"
          style={{ color: C.ink3 }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 对话列表 */}
      <div ref={scrollRef} className="max-h-[46vh] overflow-y-auto px-4 py-4">
        <div className="flex flex-col">
          {messages.map((m, i) => (
            <div
              key={`${sessionKey}-${i}`}
              className={`mb-3 max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                m.role === "user" ? "self-end rounded-br-md text-white" : "self-start rounded-bl-md"
              }`}
              style={
                m.role === "user"
                  ? { background: C.sentinel }
                  : { background: C.mist, color: C.ink }
              }
            >
              {m.content}
            </div>
          ))}

          {busy && (
            <div
              className="mb-3 self-start rounded-2xl rounded-bl-md px-4 py-2 text-[13px]"
              style={{ background: C.mist, color: C.ink4 }}
            >
              正在输入…
            </div>
          )}

          {/* 提案卡片：确认后才生成 */}
          {pending && !busy && (
            <div className="mb-3 w-full rounded-xl border p-4" style={{ borderColor: C.hairline, background: "#fbfcfc" }}>
              <div className="flex items-center gap-2">
                <span className="text-[15px]">{TYPE_ICON[pending.type] || "📝"}</span>
                <span className="text-[13px] font-medium" style={{ color: C.sentinel }}>
                  将要生成{TYPE_LABEL[pending.type] || "记录"}
                </span>
              </div>

              {pending.type === "task" && (
                <>
                  <p className="mt-2 break-words text-[15px] font-medium" style={{ color: C.ink }}>{pending.title}</p>
                  {(pending.description || messages.find((m) => m.role === "user")?.content) && (
                    <p className="mt-1 line-clamp-2 break-words text-[12px] leading-relaxed" style={{ color: C.ink3 }}>
                      {(pending.description || messages.find((m) => m.role === "user")?.content || "").slice(0, 60)}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {pending.due_at && (
                      <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: C.mist, color: C.sentinel }}>
                        🕐 {fmtTime(pending.due_at)}
                      </span>
                    )}
                    {pending.category && (
                      <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: C.mist, color: C.ink3 }}>
                        {CATEGORY_LABEL[pending.category] || pending.category}
                      </span>
                    )}
                  </div>
                </>
              )}
              {pending.type === "heart" && (
                <p className="mt-2 break-words text-[14px] leading-relaxed" style={{ color: C.ink }}>{pending.content}</p>
              )}
              {pending.type === "link" && (
                <p className="mt-2 break-words text-[13px] leading-relaxed" style={{ color: C.ink3 }}>{pending.text}</p>
              )}

              <div className="mt-3.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmCreate}
                  disabled={creating}
                  className="rounded-full px-5 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: C.sentinel }}
                >
                  {creating ? "生成中…" : "确认生成"}
                </button>
                <button
                  type="button"
                  onClick={rejectPending}
                  className="px-3 py-2 text-[12.5px] transition-opacity hover:opacity-70"
                  style={{ color: C.ink3 }}
                >
                  不对，再聊聊
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 录音提示 */}
      {recording && (
        <div className="px-4 pb-2">
          <div
            className="flex items-center justify-center rounded-xl px-4 py-2.5 text-[13px] text-white"
            style={{ background: "rgba(28,28,30,0.86)" }}
          >
            🎙️ 正在聆听…松开手指即发送
          </div>
        </div>
      )}

      {/* 输入行：长按麦克风语音输入，回车/箭头发送 */}
      <div className="border-t px-3 py-2.5" style={{ borderColor: C.hairline }}>
        <div
          className="flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-1.5"
          style={{
            borderColor: recording ? C.recordingBorder : C.hairline,
            background: recording ? C.recordingBg : C.mist,
          }}
        >
          <button
            type="button"
            title="长按语音输入"
            onPointerDown={startVoice}
            onPointerUp={stopVoice}
            onPointerLeave={stopVoice}
            onPointerCancel={stopVoice}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
              recording ? "animate-pulse text-red-500" : ""
            }`}
            style={{ color: recording ? undefined : C.ink3 }}
          >
            <Mic className="w-4 h-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={recording ? "正在聆听…松开手指即可" : "继续输入，回车发送"}
            className="flex-1 bg-transparent text-[14px] focus:outline-none"
            style={{ color: C.ink }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!input.trim() || busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-30"
            style={{ background: C.sentinel }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
