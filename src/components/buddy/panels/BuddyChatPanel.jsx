import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { BuddyMsg, useBuddyAgent, useBuddyState, todayKey } from "./shared";

/**
 * 问搭子（每颗搭子空间的专业对话）：不是模板——
 * 每日开场白由 AI 按用户当下真实状态生成（每天一条，不重样）；
 * 自由提问由搭子的人格 + 领域专业知识 + 领域档案 + 实时上下文回答。
 * 对话历史持久化在搭子板块状态里（本搭子可见，跨搭子隔离）。
 */
export default function BuddyChatPanel({ buddy, profile, tint, projectTask }) {
  const { call } = useBuddyAgent(buddy.id);
  const { state, patch } = useBuddyState(buddy.id);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const greetedRef = useRef(false);

  const chat = useMemo(() => (Array.isArray(state.chat) ? state.chat : []), [state.chat]);
  const today = todayKey();

  // 搭子此刻掌握的真实上下文（每日问候与回答都基于它，而不是套话）
  const context = useMemo(() => {
    const a = profile?.answers || {};
    const bits = [
      `今天是 ${today}`,
      profile?.plan_title ? `正在推进的项目：${profile.plan_title}` : null,
      Object.keys(a).length > 0 ? `认领时说的：${Object.values(a).join("；")}` : null,
      projectTask ? `项目约定「${projectTask.title}」今日状态：${projectTask.done_today || projectTask.status === "completed" ? "已完成" : "待赴约"}` : null,
    ];
    // 领域特有上下文
    if (buddy.id === "reading" && state.mins?.[today]) bits.push(`今日已读 ${state.mins[today]} 分钟`);
    if (buddy.id === "travel" && state.itinerary?.days) bits.push(`行程已排好 ${state.itinerary.days.length} 天`);
    if (buddy.id === "study" && state.weekly?.done_count != null) bits.push(`本周已打卡 ${state.weekly.done_count}/7 天`);
    return bits.filter(Boolean).join("；");
  }, [buddy.id, profile, projectTask, state, today]);

  // 每日开场白：AI 按上下文生成，每天一条
  useEffect(() => {
    if (greetedRef.current || !profile) return;
    greetedRef.current = true;
    if (state.greeting?.date === today && chat.length > 0) return; // 今天已问候过
    (async () => {
      try {
        const data = await call({ mode: "greeting", payload: { context } });
        const text = String(data?.text || "").trim();
        if (!text) return;
        const msg = { role: "buddy", content: text, at: new Date().toISOString() };
        patch({ greeting: { date: today, text }, chat: [...chat.slice(-39), msg] });
      } catch (_e) {
        // 问候失败不打扰，静态问候仍在页头
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [chat.length, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const userMsg = { role: "user", content: text, at: new Date().toISOString() };
    const base = [...chat, userMsg];
    patch({ chat: base.slice(-40) });
    try {
      const history = base.slice(-10).map((m) => ({ role: m.role === "user" ? "user" : "buddy", content: m.content }));
      const data = await call({ mode: "chat", payload: { messages: history, context } });
      const reply = String(data?.reply || "").trim();
      if (reply) {
        patch({ chat: [...base, { role: "buddy", content: reply, at: new Date().toISOString() }].slice(-40) });
      }
    } catch (_e) {
      patch({
        chat: [...base, { role: "buddy", content: "我走神了一下…再说一次好吗？", at: new Date().toISOString() }].slice(-40),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[11px] tracking-widest text-stone-400">问{buddy.name}</span>
        <span className="text-[10px] text-stone-300">专业问题，随时问</span>
      </div>

      {chat.length > 0 && (
        <div ref={scrollRef} className="mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-1">
          {chat.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#384877] px-3.5 py-2.5 text-[14px] leading-relaxed text-[#FAF9F7]">
                  {m.content}
                </div>
              </div>
            ) : (
              <BuddyMsg key={i} tint={tint}>
                {m.content}
              </BuddyMsg>
            )
          )}
          {sending && (
            <div className="flex items-center gap-2 pl-10 text-xs text-stone-400">
              <Loader2 className="w-3 h-3 animate-spin" /> {buddy.name}在想…
            </div>
          )}
        </div>
      )}

      {chat.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(QUICK_ASKS[buddy.id] || []).map((q) => (
            <button
              key={q}
              onClick={() => {
                setInput(q);
              }}
              className="min-h-[32px] rounded-full border border-stone-200 px-3 text-xs text-stone-500 transition-colors hover:border-stone-400"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`问点专业的，比如「${QUICK_ASKS[buddy.id]?.[0] || "怎么坚持下去"}」`}
          className="min-h-[42px] flex-1 rounded-full border border-stone-200 bg-[#FAF9F7] px-4 text-[14px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="min-h-[42px] rounded-full px-4 text-sm font-medium text-white transition-transform active:scale-95 disabled:opacity-50"
          style={{ background: tint[2] }}
        >
          发送
        </button>
      </form>
    </section>
  );
}

const QUICK_ASKS = {
  study: ["这道题怎么入手？", "背了就忘怎么办？", "帮我拆一下这周的目标"],
  travel: ["当地有什么坑要避？", "帮我看看行程合理吗", "预算大概要多少？"],
  reading: ["这本书值不值得读？", "读不进去怎么办？", "给我抛个问题吧"],
  morning: ["总是赖床怎么办？", "几点睡才够？", "周末要不要补觉？"],
};
