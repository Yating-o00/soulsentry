import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { base44 } from "@/api/base44Client";

// 今日页对话浮层：输入内容不再直建，而是进入与心栈的对话，
// AI 理解意图后给出提案卡（约定/心签/链接），用户确认后才真正生成；
// 信息不足时 AI 主动追问（通常问时间）。与小程序心流页 FlowChatSheet 同一后端 /api/chat。

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

export default function TodayChatDialog({ open, seedText, onClose, onCreated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // AI 提案，待用户确认
  const [creating, setCreating] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const scrollRef = useRef(null);

  // 每次打开都是新对话；seed 作为第一条用户消息发出
  useEffect(() => {
    if (!open) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      if (pending.type === "task") {
        // 详情保底：AI 未返回 description 时，用首条用户输入作为约定详情
        const firstUserText = messages.find((m) => m.role === "user")?.content || "";
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
      setMessages((m) => [...m, { role: "assistant", content: `「${doneLabel}」已为你记下了 ✓ 还想聊点什么吗？` }]);
      setPending(null);
      onCreated?.({ type: pending.type, label: doneLabel });
    } catch (err) {
      toast.error(err?.message || "生成失败，请再试一次");
    } finally {
      setCreating(false);
    }
  };

  // 今日页 section 带 content-visibility:auto（绘制包含块），position:fixed 会被困在章节内；
  // 必须 portal 到 body，浮层才能相对视口定位
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{ zIndex: 80 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/45 p-3 sm:p-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{ height: "min(82vh, 720px)" }}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
              <div>
                <p className="font-[var(--font-serif)] text-[16px] text-[var(--sky-ink)]">和心栈聊聊</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--ink-3)]">想记住的事，说给我听，我会替你整理好</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-black/[0.05]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 对话列表 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-col">
                {messages.map((m, i) => (
                  <div
                    key={`${sessionKey}-${i}`}
                    className={`mb-3 max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                      m.role === "user"
                        ? "self-end rounded-br-md bg-[var(--sentinel)] text-white"
                        : "self-start rounded-bl-md bg-slate-100 text-[var(--ink)]"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}

                {busy && (
                  <div className="mb-3 self-start rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2 text-[13px] text-[var(--ink-3)]">
                    正在输入…
                  </div>
                )}

                {/* 提案卡片：确认后才生成 */}
                {pending && !busy && (
                  <div className="mb-3 w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper)]/[0.5] p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px]">{TYPE_ICON[pending.type] || "📝"}</span>
                      <span className="text-[13px] font-medium text-[var(--sentinel)]">
                        将要生成{TYPE_LABEL[pending.type] || "记录"}
                      </span>
                    </div>

                    {pending.type === "task" && (
                      <>
                        <p className="mt-2 break-words text-[15px] font-medium text-[var(--ink)]">{pending.title}</p>
                        {(pending.description || messages.find((m) => m.role === "user")?.content) && (
                          <p className="mt-1 line-clamp-2 break-words text-[12px] leading-relaxed text-[var(--ink-3)]">
                            {(pending.description || messages.find((m) => m.role === "user")?.content || "").slice(0, 60)}
                          </p>
                        )}
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {pending.due_at && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-[var(--sentinel)]">
                              🕐 {fmtTime(pending.due_at)}
                            </span>
                          )}
                          {pending.category && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-[var(--ink-3)]">
                              {CATEGORY_LABEL[pending.category] || pending.category}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                    {pending.type === "heart" && (
                      <p className="mt-2 break-words text-[14px] leading-relaxed text-[var(--ink)]">{pending.content}</p>
                    )}
                    {pending.type === "link" && (
                      <p className="mt-2 break-words text-[13px] leading-relaxed text-[var(--ink-3)]">{pending.text}</p>
                    )}

                    <div className="mt-3.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={confirmCreate}
                        disabled={creating}
                        className="rounded-full bg-[var(--sentinel)] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--sentinel-deep)] disabled:opacity-50"
                      >
                        {creating ? "生成中…" : "确认生成"}
                      </button>
                      <button
                        type="button"
                        onClick={rejectPending}
                        className="px-3 py-2 text-[12.5px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                      >
                        不对，再聊聊
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 输入行 */}
            <div className="border-t border-[var(--hairline)] px-4 py-3">
              <div className="flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-slate-50 pl-4 pr-1.5 py-1.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="直接输入，回车发送"
                  className="flex-1 bg-transparent text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-3)]/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={!input.trim() || busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sentinel)] text-white transition-all hover:bg-[var(--sentinel-deep)] disabled:opacity-30"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
