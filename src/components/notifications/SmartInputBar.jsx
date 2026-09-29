import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Loader2, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { base44 } from "@/api/base44Client";
import ChatPasteRecognizer from "@/components/heartsign/ChatPasteRecognizer";
import { looksLikeChatLog } from "@/components/utils/processPastedContent";

// 对话配色全部内联，不依赖 .today-page 作用域的 CSS 变量，避免白底白字。
const C = {
  sentinel: "#384877",
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

const SAMPLES = ['明早7点飞深圳', '今晚8点给妈妈打电话', '突然想去看看海', '今天有点累，但很踏实'];

function fmtDayTime(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
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

/**
 * 心栈之门 —— 今日页统一记忆入口：输入框即对话入口。
 * 用户只管说（打字回车 / 长按麦克风），AI 在同一卡片内连续多轮对话，
 * 理解意图后给出提案卡，用户确认后才生成约定 / 心签 / 链接。
 */
export default function SmartInputBar() {
  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [echo, setEcho] = useState(null); // 记忆回响:刚才那一句去了哪里
  const [showChatRecognizer, setShowChatRecognizer] = useState(false);
  // —— 对话状态（与后端 /api/chat 多轮，last_extracted 追踪提案）——
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);
  // —— 浏览器小助手（对话内嵌 Agent）：agentExecId 非空时轮询执行状态 ——
  const [agentExecId, setAgentExecId] = useState(null);
  const [agentStatus, setAgentStatus] = useState("");
  const agentPollRef = useRef(null);
  const lastAskedRef = useRef("");
  const taRef = useRef(null);
  const threadRef = useRef(null);
  const recognitionRef = useRef(null);
  const queryClient = useQueryClient();

  const stopAgentPoll = () => {
    if (agentPollRef.current) {
      clearInterval(agentPollRef.current);
      agentPollRef.current = null;
    }
  };

  // 输入框随内容自动长高（上限约 6 行），空着时保持单行的简洁状态
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`;
  }, [inputValue]);

  // 新消息/提案出现时，对话线程滚到底部
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, pending]);

  useEffect(() => () => {
    try { recognitionRef.current?.stop?.(); } catch {}
    stopAgentPoll();
  }, []);

  // —— 浏览器小助手：启动后轮询执行状态，提问与结果回落到对话里 ——
  const pushAssistant = (content, extra = {}) => {
    setMessages((m) => [...m, { role: "assistant", content, ...extra }]);
  };

  const startAgent = (executionId) => {
    stopAgentPoll();
    setAgentExecId(executionId);
    lastAskedRef.current = "";
    pushAssistant("🕹️ 浏览器小助手出发了，我去网页上一步步帮你办，进展和结果都会回到这里；中途需要你拿主意的地方，我会停下来问你～", { agent: true });
    setAgentStatus("正在打开网页…");
    agentPollRef.current = setInterval(() => pollAgent(executionId), 2500);
  };

  const finishAgent = (finalMessage) => {
    stopAgentPoll();
    setAgentExecId(null);
    setAgentStatus("");
    if (finalMessage) pushAssistant(finalMessage, { agent: true });
    queryClient.invalidateQueries({ queryKey: ['task-executions'] });
  };

  const pollAgent = async (executionId) => {
    try {
      const st = await httpRequest(`/api/task-executions/${executionId}/agent-state`);
      if (!st) return;
      if (st.active) {
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
      const res = await httpRequest("/api/chat", {
        method: "POST",
        body: {
          messages: msgs,
          last_extracted: lastExtracted,
          agent_execution_id: agentExecId || undefined
        }
      });
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

  // —— 唯一入口：文字/语音都汇聚到这里发给 AI ——
  const send = (raw) => {
    const t = String(raw !== undefined ? raw : inputValue).trim();
    if (!t || busy) return;
    const msgs = [...messages, { role: "user", content: t.slice(0, 500) }];
    setMessages(msgs);
    setInputValue("");
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
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      setEcho({ kind: pending.type === 'task' ? 'task' : 'note', title: doneLabel });
      setPending(null);
    } catch (err) {
      toast.error(err?.message || "生成失败，请再试一次");
    } finally {
      setCreating(false);
    }
  };

  // —— 长按麦克风：按住说话，松开识别并直接作为消息发送 ——
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

  const clearChat = () => {
    stopAgentPoll();
    setAgentExecId(null);
    setAgentStatus("");
    setMessages([]);
    setPending(null);
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    if (looksLikeChatLog((inputValue + pasted).trim())) setShowChatRecognizer(true);
  };

  const echoReply = (() => {
    if (!echo) return '';
    if (echo.kind === 'note') return `「${echo.title}」—— 这句我替你收好了。心事放在这里，不会被弄丢。`;
    return `「${echo.title}」已收进今日印记，到点我会轻轻唤你。`;
  })();

  const firstUserText = messages.find((m) => m.role === "user")?.content || "";

  return (
    <div className="mt-7 w-full">
      {showChatRecognizer && inputValue.trim() && (
        <div className="px-1 mb-2">
          <ChatPasteRecognizer
            text={inputValue}
            onDone={() => { setInputValue(""); setShowChatRecognizer(false); }}
            onDismiss={() => setShowChatRecognizer(false)}
          />
        </div>
      )}

      <p className="mb-3 font-[var(--font-serif)] text-[17px] text-[var(--sky-ink)]">
        告诉我，<span className="text-[var(--signal)]">任何事情</span>
      </p>

      {/* 心栈之门：对话与输入共用一个卡片 */}
      <div
        className={`gate-vessel rounded-2xl ${focused ? 'is-listening' : 'is-quiet'}`}
        style={recording ? { borderColor: C.recordingBorder, background: C.recordingBg } : undefined}
      >
        {/* 对话线程：确认后才会生成 */}
        {messages.length > 0 && (
          <div ref={threadRef} className="max-h-[42vh] overflow-y-auto px-4 sm:px-5 pt-4">
            <div className="flex flex-col">
              {messages.map((m, i) => (
                <div
                  key={i}
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
                  {/* 小助手提问附带的可点选项：点击即以用户身份发送 */}
                  {m.role === "assistant" && Array.isArray(m.choices) && m.choices.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.choices.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => send(c)}
                          className="rounded-full border px-3 py-1 text-[12px] transition-colors hover:bg-white"
                          style={{ borderColor: "rgba(56,72,119,0.35)", color: C.sentinel, background: "rgba(56,72,119,0.06)" }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* 小助手执行状态条 */}
              {agentExecId && agentStatus && (
                <div className="mb-3 flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-[12px]" style={{ background: "rgba(56,72,119,0.07)", color: C.sentinel }}>
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: C.sentinel }} />
                  {agentStatus}
                </div>
              )}

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
                      {(pending.description || firstUserText) && (
                        <p className="mt-1 line-clamp-2 break-words text-[12px] leading-relaxed" style={{ color: C.ink3 }}>
                          {(pending.description || firstUserText).slice(0, 60)}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {pending.due_at && (
                          <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: C.mist, color: C.sentinel }}>
                            🕐 {fmtDayTime(pending.due_at)}
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

            <div className="mb-1 border-t" style={{ borderColor: C.hairline }} />
          </div>
        )}

        <textarea
          ref={taRef}
          value={inputValue}
          rows={1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setInputValue(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={messages.length > 0 ? "继续输入，回车发送" : "约定、心事、一闪而过的念头……说给我听"}
          className="w-full resize-none overflow-hidden bg-transparent px-5 sm:px-6 pt-4 pb-1.5 text-[15.5px] leading-relaxed text-[var(--sky-ink)] placeholder:text-[var(--sky-sub)]/70 focus:outline-none"
        />

        <div className="flex items-center gap-2 px-4 sm:px-5 pb-3.5 pt-1">
          <button
            type="button"
            title="长按语音输入"
            onPointerDown={startVoice}
            onPointerUp={stopVoice}
            onPointerLeave={stopVoice}
            onPointerCancel={stopVoice}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
              recording ? 'animate-pulse text-red-500 bg-red-100' : 'text-[var(--sky-sub)] hover:text-[var(--sky-ink)] hover:bg-black/[0.04]'
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
          {recording && (
            <span className="text-[12px]" style={{ color: C.ink3 }}>正在聆听…松开发送</span>
          )}
          {messages.length > 0 && !recording && (
            <button
              type="button"
              onClick={clearChat}
              title="收起对话"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--sky-sub)] transition-all duration-200 hover:text-[var(--sky-ink)] hover:bg-black/[0.04]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => send()}
            disabled={!inputValue.trim() || busy}
            title="发送（Enter）"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-white transition-all duration-300 disabled:opacity-30"
            style={{ background: C.sentinel }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 示例引路 */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SAMPLES.map((s) => (
          <button
            key={s}
            onClick={() => setInputValue(s)}
            className="sky-chip rounded-full border border-[var(--hairline)] bg-slate-50/80 px-3.5 py-1.5 text-[12.5px] text-[var(--ink-2)] transition-all duration-300 hover:border-[var(--sentinel)]/50 hover:text-[var(--sentinel)]"
          >
            {s}
          </button>
        ))}
      </div>

      {/* 记忆回响:被听见、被记住的瞬间 */}
      {echo && (
        <div key={echo.title + echo.kind} className="echo-born hairline-card mt-6 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--signal-soft)] text-[13px] text-[var(--signal)]">
              ✦
            </span>
            <div className="min-w-0">
              <p className="font-[var(--font-serif)] text-[14.5px] leading-relaxed text-[var(--ink)]">
                {echoReply}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
                {echo.kind === 'note' ? (
                  <span className="rounded-md bg-[var(--sentinel)]/[0.09] px-2.5 py-1 font-medium text-[var(--sentinel)]">
                    已生成心签
                  </span>
                ) : (
                  <span className="rounded-md bg-[var(--signal-soft)] px-2.5 py-1 font-medium text-[var(--signal)]">
                    已生成约定
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
