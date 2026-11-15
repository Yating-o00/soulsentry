import React, { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { BuddyMsg, PanelCard, ProgressBar, TintButton, useBuddyAgent, useBuddyState, todayKey } from "./shared";

const parseGoal = (mins) => parseInt(String(mins || "20"), 10) || 20;

/**
 * 在读（读书搭子首页板块）：在读卡（今日分钟数持久化）+ 输出式「讲给搭子听」——
 * 讲一段，搭子回应并抛下一个问题；讲述同时存成笔记（板块状态 + 心签）。
 */
export function ReadingNowPanel({ profile, tint, persona }) {
  const { call } = useBuddyAgent("reading");
  const { state, patch } = useBuddyState("reading");
  const [talkInput, setTalkInput] = useState("");
  const [talking, setTalking] = useState(false);
  const [reply, setReply] = useState(null);

  const book = state.current_book || profile?.answers?.book || "人类简史";
  const goal = parseGoal(profile?.answers?.mins);
  const today = todayKey();
  const done = state.mins?.[today] || 0;
  const pct = Math.min(100, Math.round((done / goal) * 100));

  const greeting = {
    gentle: `今天读 ${goal} 分钟就好，读到哪算哪。`,
    strict: `今日任务：${goal} 分钟。读完我要提问。`,
    buddy: "我也在「读」同一本——今天谁先读完谁抛问题！",
  };

  const addMins = (n) => patch({ mins: { [today]: done + n } });

  const talk = async () => {
    const text = talkInput.trim();
    if (!text || talking) return;
    setTalking(true);
    try {
      const data = await call({ mode: "talk", payload: { book, text } });
      setReply(data);
      setTalkInput("");
      const note = { text, book, day: today, reply: data.reply, question: data.question };
      patch({ notes: [...(state.notes || []), note] });
      // 同步收进心签（讲出来才算读懂——这是最值得留住的）
      base44.entities.Note.create({
        title: `讲书 · 《${book}》`,
        content: `我讲：${text}\n搭子说：${data.reply}\n下一问：${data.question}`,
        source_type: "buddy_reading",
        tags: ["读书笔记", "心签"],
      }).catch(() => {});
    } catch (e) {
      toast.error(e?.message || "搭子走神了，再试一次");
    } finally {
      setTalking(false);
    }
  };

  return (
    <div className="space-y-4">
      <BuddyMsg tint={tint}>{greeting[persona] || greeting.gentle}</BuddyMsg>

      {/* 在读卡片 */}
      <PanelCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold text-stone-900">《{book}》</div>
            <div className="mt-0.5 text-sm text-stone-400">共读中</div>
          </div>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: tint[0], color: tint[2] }}>
            {pct}%
          </span>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-stone-400">今日阅读</span>
            <span className="text-stone-600">
              <span className="font-semibold" style={{ color: tint[2] }}>{done}</span> / {goal} 分钟
            </span>
          </div>
          <div className="mt-1.5">
            <ProgressBar pct={pct} tint={tint} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TintButton tint={tint} outline onClick={() => addMins(10)}>＋10 分钟</TintButton>
            <TintButton tint={tint} onClick={() => addMins(20)}>读满 20 分钟</TintButton>
          </div>
        </div>
      </PanelCard>

      {/* 输出式：讲给搭子听 */}
      <PanelCard dark>
        <div className="text-xs tracking-widest opacity-70">讲出来，才算读懂</div>
        <p className="mt-2 text-[15px] leading-relaxed">
          {state.daily_question || `读完今天这段——《${book}》里哪个观点最戳你？`}
        </p>
        {reply ? (
          <div className="mt-3 space-y-2">
            <p className="rounded-xl bg-white/10 p-3 text-sm leading-relaxed">{reply.reply}</p>
            <p className="rounded-xl bg-white/10 p-3 text-sm leading-relaxed opacity-90">下一问：{reply.question}</p>
            <button onClick={() => setReply(null)} className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100">
              再讲一段
            </button>
          </div>
        ) : (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              talk();
            }}
          >
            <input
              value={talkInput}
              onChange={(e) => setTalkInput(e.target.value)}
              placeholder="用一两句话，讲讲你的想法…"
              className="min-h-[44px] flex-1 rounded-full bg-white/10 px-4 text-sm text-[#FAF9F7] placeholder:text-[#FAF9F7]/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!talkInput.trim() || talking}
              className="min-h-[44px] rounded-full bg-[#FAF9F7] px-4 text-sm font-medium text-stone-900 transition-transform active:scale-95 disabled:opacity-50"
            >
              {talking ? <Loader2 className="w-4 h-4 animate-spin" /> : "讲给ta听"}
            </button>
          </form>
        )}
      </PanelCard>
    </div>
  );
}

/** 书架：在读 / 想读（可排队、可换读）/ 读完（毕业记录） */
export function ShelfPanel({ profile, tint }) {
  const { state, patch } = useBuddyState("reading");
  const [wantInput, setWantInput] = useState("");

  const current = state.current_book || profile?.answers?.book || "人类简史";
  const want = state.shelf_want || [];
  const doneList = state.shelf_done || [];

  const addWant = () => {
    const t = wantInput.trim().replace(/[《》]/g, "");
    if (!t || want.includes(t)) return;
    patch({ shelf_want: [...want, t] });
    setWantInput("");
  };

  const switchTo = (title) => {
    patch({
      current_book: title,
      shelf_want: want.filter((w) => w !== title),
      daily_question: null,
    });
    toast.success(`开始共读《${title}》`);
  };

  const finishCurrent = () => {
    patch({
      shelf_done: [...doneList, { title: current, finished_at: todayKey(), notes: (state.notes || []).filter((n) => n.book === current).length }],
      current_book: want[0] || null,
      shelf_want: want.slice(1),
    });
    toast.success(`《${current}》读完了，了不起`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="px-1 text-[11px] tracking-widest text-stone-400">在读</h3>
        <PanelCard>
          <div className="flex items-center justify-between">
            <span className="font-medium text-stone-900">《{current}》</span>
            <TintButton tint={tint} outline onClick={finishCurrent} className="!min-h-[36px] !px-3 text-xs">
              读完了
            </TintButton>
          </div>
        </PanelCard>
      </div>

      <div>
        <h3 className="px-1 text-[11px] tracking-widest text-stone-400">想读 · 搭子按你的偏好排队</h3>
        <div className="mt-2 space-y-2">
          {want.map((title) => (
            <PanelCard key={title}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-900">《{title}》</span>
                <button onClick={() => switchTo(title)} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: tint[2], color: tint[2] }}>
                  换读这本
                </button>
              </div>
            </PanelCard>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addWant();
            }}
          >
            <input
              value={wantInput}
              onChange={(e) => setWantInput(e.target.value)}
              placeholder="想读的书，先排进队列…"
              className="min-h-[44px] flex-1 rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
            />
            <TintButton tint={tint} outline className="!px-4" disabled={!wantInput.trim()}>
              <Plus className="w-4 h-4" />
            </TintButton>
          </form>
        </div>
      </div>

      {doneList.length > 0 && (
        <div>
          <h3 className="px-1 text-[11px] tracking-widest text-stone-400">读完 · 有毕业记录</h3>
          <PanelCard>
            {doneList.map((b) => (
              <div key={b.title} className="flex items-center justify-between py-1">
                <span className="text-stone-700">《{b.title}》</span>
                <span className="text-xs text-stone-400">读完 · 笔记 {b.notes} 条</span>
              </div>
            ))}
          </PanelCard>
        </div>
      )}
    </div>
  );
}

/** 读书笔记：讲书与摘抄的沉淀，月底自动生成读书小报（预告） */
export function ReadingNotesPanel({ tint }) {
  const { state } = useBuddyState("reading");
  const notes = state.notes || [];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-semibold text-stone-900">读书笔记</h2>
        <span className="text-xs text-stone-400">月底自动生成读书小报</span>
      </div>
      {notes.length === 0 && (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-5 text-center text-sm text-stone-400">
          还没有笔记。读到心动的句子，在「在读」板块讲给搭子听，就会自动存到这里。
        </p>
      )}
      {[...notes].reverse().map((n, i) => (
        <PanelCard key={i}>
          <p className="text-[15px] leading-relaxed text-stone-800">{n.text}</p>
          {n.reply && <p className="mt-2 text-[13px] leading-relaxed text-stone-500">搭子：{n.reply}</p>}
          <div className="mt-2 text-xs text-stone-400">{n.day} · 《{n.book}》</div>
        </PanelCard>
      ))}
    </div>
  );
}
