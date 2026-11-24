import React, { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { PanelCard, ProgressBar, TintButton, useBuddyAgent, useBuddyState, todayKey } from "./shared";
import BuddyChatPanel from "./BuddyChatPanel";

const parseGoal = (mins) => parseInt(String(mins || "20"), 10) || 20;

function ReadingArtifact({ book, done, goal, pct, tint, dailyQuestion, lastTalk, talking }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] tracking-widest text-stone-400">在读</span>
        <span className="text-[10px] text-stone-400">{talking ? "搭子在回应…" : "讲出来，才算读懂"}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <h3 className="truncate text-[15px] font-semibold text-stone-900">《{book}》</h3>
        <span className="shrink-0 text-[11px] text-stone-500">
          <span className="font-semibold" style={{ color: tint[2] }}>{done}</span> / {goal} 分钟
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar pct={pct} tint={tint} />
      </div>
      <p className="mt-2.5 rounded-xl bg-[#FAF9F7] px-3 py-2 text-[12px] leading-relaxed text-stone-600">
        {dailyQuestion}
      </p>
      {lastTalk?.reply && (
        <div className="mt-2 rounded-xl border border-stone-100 bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-500">
          <p className="line-clamp-3">搭子说：{lastTalk.reply}</p>
        </div>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
        读了多久、读到什么，直接在下面聊天框说；讲一段，搭子会接着问。
      </p>
    </div>
  );
}

/**
 * 读书搭子第一栏：只保留一个聊天输入口。
 * 今日进度、搭子的问题、讲书后的回应，全部收进聊天面板里的「在读」卡片；
 * 用户说「读了 20 分钟」会自动记时，讲一段书会得到回应 + 下一问，不再需要第二个输入框。
 */
export function ReadingChatPanel({ buddy, profile, tint, projectTask = null }) {
  const { call } = useBuddyAgent("reading");
  const { state, patch } = useBuddyState("reading");
  const queryClient = useQueryClient();
  const [talking, setTalking] = useState(false);
  const [lastTalk, setLastTalk] = useState(() => {
    const notes = Array.isArray(state.notes) ? state.notes : [];
    const last = [...notes].reverse().find((note) => note?.reply);
    return last ? { text: last.text || "", book: last.book || "", reply: last.reply, question: last.question || "" } : null;
  });
  const talkingRef = useRef(false);

  const book = state.current_book || profile?.answers?.book || "人类简史";
  const goal = parseGoal(profile?.answers?.mins);
  const today = todayKey();
  const done = state.mins?.[today] || 0;
  const pct = Math.min(100, Math.round((done / goal) * 100));
  // 换书后不要继续显示上一本书的回应
  const lastTalkForBook = lastTalk && (!lastTalk.book || lastTalk.book === book) ? lastTalk : null;
  const dailyQuestion = lastTalkForBook?.question || state.daily_question || `读完今天这段——《${book}》里哪个观点最戳你？`;

  const talk = async (text) => {
    if (!text || talkingRef.current) return;
    talkingRef.current = true;
    setTalking(true);
    try {
      const data = await call({ mode: "talk", payload: { book, text } });
      const reply = String(data?.reply || "").trim();
      const question = String(data?.question || "").trim();
      setLastTalk({ text, book, reply, question });
      // 上一轮对话的 capture 可能已经追加了读书记录，从最新缓存取 notes，避免把新记录覆盖掉
      const latestMine = queryClient.getQueryData(["buddies", "mine"]);
      const latestNotes = latestMine?.buddies?.reading?.state?.notes || state.notes || [];
      patch({
        daily_question: question || state.daily_question || null,
        notes: [
          ...latestNotes,
          { text, book, day: today, reply, question },
        ].slice(-200),
      });
      // 讲出来的内容同步收进心签（讲书共读）
      base44.entities.Note.create({
        title: `讲书 · 《${book}》`,
        content: `我讲：${text}\n搭子说：${reply}\n下一问：${question}`,
        source_type: "buddy_reading",
        tags: ["读书笔记", "心签"],
        metadata: {
          _extraFields: {
            source_buddy: "reading",
            source_buddy_name: "读书搭子",
            source_scene: `讲书共读 · 《${book}》`,
            ...(projectTask?.id ? { source_task_id: projectTask.id, source_task_title: projectTask.title } : {}),
          },
        },
      }).catch(() => {});
    } catch (_error) {
      toast.error("搭子走神了，再讲一次好吗");
    } finally {
      talkingRef.current = false;
      setTalking(false);
    }
  };

  const shouldTalkFromChat = (text) => {
    const t = String(text || "").trim();
    if (t.length < 8) return false;
    if (/(讲给|讲书|我讲|共读|分享一下)/.test(t)) return true;
    const reflective = /(我觉得|我认为|这段|这句话|作者|观点|感受|感觉|想到|启发|让我|喜欢|不喜欢|书里|印象深刻|有意思)/.test(t);
    // 只是报「读了多少分钟/页」交给读书记录，不必再走一遍讲书回应，避免重复记录
    if (/(\d+\s*(分钟|页)|读了|读到|看完|读完)/.test(t) && !reflective) return false;
    if (!reflective) return false;
    // 纯提问交给聊天回答；带自己看法的讨论才进入「讲书」回应
    if (/[?？]$/.test(t) && !/(我觉得|我认为|这段|这句话|感受|感觉|想到|启发|让我)/.test(t)) return false;
    return true;
  };

  return (
    <BuddyChatPanel
      buddy={buddy}
      profile={profile}
      tint={tint}
      projectTask={projectTask}
      artifacts={
        <ReadingArtifact
          book={book}
          done={done}
          goal={goal}
          pct={pct}
          tint={tint}
          dailyQuestion={dailyQuestion}
          lastTalk={lastTalkForBook}
          talking={talking}
        />
      }
      onAfterSend={({ text }) => {
        if (shouldTalkFromChat(text)) talk(text);
      }}
    />
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
          {want.length === 0 && (
            <PanelCard>
              <p className="text-xs text-stone-400">搭子按你的偏好推荐，点一下就排进队列（示例）：</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {(profile?.answers?.genre === "商业成长"
                  ? ["纳瓦尔宝典", "穷查理宝典", "原则"]
                  : profile?.answers?.genre === "文学小说"
                    ? ["活着", "百年孤独", "克拉拉与太阳"]
                    : ["置身事内", "人类简史", "枪炮、病菌与钢铁"]
                ).map((t) => (
                  <button
                    key={t}
                    onClick={() => patch({ shelf_want: [t] })}
                    className="rounded-full border border-dashed px-3 py-1.5 text-xs transition-colors hover:bg-stone-50"
                    style={{ borderColor: tint[1], color: tint[2] }}
                  >
                    ＋《{t}》
                  </button>
                ))}
              </div>
            </PanelCard>
          )}
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
