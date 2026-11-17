import React, { useState } from "react";
import { Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { BuddyMsg, PanelCard, TintButton, useBuddyAgent } from "./shared";

/**
 * 引导式解题（学习搭子核心板块）：
 * 考点定位 → 分层提示 L1-L4 → 变式题检验 → 沉淀闭环（错题清除 + 心签）。
 * 全程 LLM 驱动（/api/buddies/study/agent），提示词服务端定型：引导而非直接给答案。
 */
export default function SolvePanel({ tint, persona, projectTask = null }) {
  const { call } = useBuddyAgent("study");
  const [problem, setProblem] = useState("");
  const [stage, setStage] = useState("idle"); // idle → located → hinting → quiz → done
  const [located, setLocated] = useState(null); // {subject, point, ask}
  const [stuck, setStuck] = useState(null); // "none" | "half"
  const [hints, setHints] = useState([]); // [{level,name,content}]
  const [quiz, setQuiz] = useState(null); // {question,options,answer,explain}
  const [quizPick, setQuizPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sediment, setSediment] = useState(false);

  const reset = () => {
    setStage("idle");
    setProblem("");
    setLocated(null);
    setStuck(null);
    setHints([]);
    setQuiz(null);
    setQuizPick(null);
    setSediment(false);
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e?.message || "搭子走神了，再试一次");
    } finally {
      setBusy(false);
    }
  };

  const locate = () =>
    run(async () => {
      const data = await call({ mode: "solve_locate", payload: { problem } });
      setLocated(data);
      setStage("located");
    });

  const pickStuck = (v) =>
    run(async () => {
      setStuck(v);
      const data = await call({ mode: "solve_hint", payload: { problem, level: 1 } });
      setHints([data]);
      setStage("hinting");
    });

  const nextHint = (targetLevel) =>
    run(async () => {
      const level = targetLevel ?? Math.min(4, hintLevel + 1);
      const data = await call({
        mode: "solve_hint",
        payload: { problem, level, prev_hints: hints.map((h) => h.content) },
      });
      setHints((h) => [...h.filter((x) => x.level !== data.level), data].sort((a, b) => a.level - b.level));
    });

  const toQuiz = () =>
    run(async () => {
      const data = await call({ mode: "solve_quiz", payload: { problem } });
      setQuiz(data);
      setQuizPick(null);
      setStage("quiz");
    });

  const answer = async (i) => {
    if (quizPick !== null) return;
    setQuizPick(i);
    if (i === quiz.answer) {
      setStage("done");
      // 沉淀闭环：这道题的考点 + 思路进心签（带来源徽标：学习搭子 · 解题沉淀 · 所属约定）
      try {
        await base44.entities.Note.create({
          title: `解题沉淀 · ${located?.point || "一道题"}`,
          content: `题目：${problem}\n考点：${located?.subject || ""} · ${located?.point || ""}\n关键提示：${hints.map((h) => `L${h.level} ${h.content}`).join("；")}`,
          source_type: "buddy_solve",
          tags: ["沉淀", "心签"],
          metadata: {
            _extraFields: {
              source_buddy: "study",
              source_buddy_name: "学习搭子",
              source_scene: "解题沉淀",
              ...(projectTask?.id ? { source_task_id: projectTask.id, source_task_title: projectTask.title } : {}),
            },
          },
        });
        setSediment(true);
      } catch (_e) {
        // 沉淀失败不打断体验
      }
    }
  };

  const hintLevel = hints.reduce((m, h) => Math.max(m, h.level || 0), 0);
  const solved = stage === "done";

  return (
    <div className="space-y-4">
      <BuddyMsg tint={tint}>
        {stage === "idle"
          ? persona === "strict"
            ? "卡住的题发给我。我不给答案，只一层层提示，直到你自己做出来。"
            : "哪道题卡住了？发给我——我不直接给答案，但保证陪你做出来。"
          : solved
            ? "做对了！这道题背后真正学会的思路，我已经帮你存好了。"
            : "别急，我们一层一层来。"}
      </BuddyMsg>

      {stage === "idle" && (
        <PanelCard title="拍一道你卡住的题">
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            rows={4}
            placeholder="把题目打进来（拍照识别在小程序端已支持，Web 端先贴文字）…"
            className="mt-3 w-full rounded-xl border border-stone-200 bg-[#FAF9F7] p-3.5 text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
          />
          <TintButton tint={tint} onClick={locate} disabled={!problem.trim() || busy} className="mt-3 w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (
              <span className="inline-flex items-center gap-1.5"><Camera className="w-4 h-4" /> 发给搭子，开始解题</span>
            )}
          </TintButton>
        </PanelCard>
      )}

      {stage !== "idle" && (
        <>
          <PanelCard
            title={located ? `${located.subject || "题目"} · 考点「${located.point || "定位中"}」` : "题目"}
            extra={
              <button onClick={reset} className="text-xs text-stone-400 hover:text-stone-600">
                换一道题
              </button>
            }
          >
            <p className="mt-2.5 text-[15px] leading-relaxed text-stone-800 whitespace-pre-wrap">{problem}</p>
          </PanelCard>

          {located?.ask && stage === "located" && <BuddyMsg tint={tint}>{located.ask}</BuddyMsg>}

          {stage === "located" && !stuck && (
            <div className="flex gap-2 pl-10">
              <TintButton tint={tint} outline onClick={() => pickStuck("none")} disabled={busy}>
                完全没思路
              </TintButton>
              <TintButton tint={tint} outline onClick={() => pickStuck("half")} disabled={busy}>
                做了一半卡住
              </TintButton>
            </div>
          )}

          {hints.map((h) => (
            <BuddyMsg key={h.level} tint={tint}>
              <span className="mb-1 block text-xs font-medium tracking-wide" style={{ color: tint[2] }}>
                L{h.level} · {h.name}
              </span>
              {h.content}
            </BuddyMsg>
          ))}

          {stage === "hinting" && (
            <div className="flex flex-wrap gap-2 pl-10">
              <TintButton tint={tint} onClick={toQuiz} disabled={busy}>
                我做出来了
              </TintButton>
              {hintLevel < 4 && (
                <TintButton tint={tint} outline onClick={() => nextHint()} disabled={busy}>
                  {busy ? "想提示中…" : "再提示一点"}
                </TintButton>
              )}
              {hintLevel < 4 && (
                <button
                  onClick={() => nextHint(4)}
                  disabled={busy}
                  className="min-h-[44px] px-3 text-sm text-stone-400 underline underline-offset-4 hover:text-stone-600"
                >
                  直接看答案
                </button>
              )}
            </div>
          )}

          {stage === "quiz" && quiz && (
            <>
              <BuddyMsg tint={tint}>等等——做对一道不算会，试试这道变式题：{quiz.question}</BuddyMsg>
              <div className="grid grid-cols-2 gap-2 pl-10">
                {quiz.options.map((o, i) => {
                  const picked = quizPick === i;
                  const show = quizPick !== null;
                  const right = i === quiz.answer;
                  return (
                    <button
                      key={i}
                      onClick={() => answer(i)}
                      disabled={show}
                      className={`min-h-[48px] rounded-2xl border px-3 text-[15px] transition-all active:scale-95 ${
                        show && right
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : show && picked && !right
                            ? "border-red-400 bg-red-50 text-red-600"
                            : "border-stone-200 bg-white text-stone-800 hover:border-stone-400"
                      }`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              {quizPick !== null && quizPick !== quiz.answer && (
                <>
                  <BuddyMsg tint={tint}>差一点点。{quiz.explain}——再选一次试试？</BuddyMsg>
                  <button
                    onClick={() => setQuizPick(null)}
                    className="ml-10 min-h-[40px] rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-600"
                  >
                    重新作答
                  </button>
                </>
              )}
            </>
          )}

          {solved && (
            <PanelCard dark>
              <div className="text-xs tracking-widest opacity-70">已自动沉淀</div>
              <ul className="mt-2.5 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FAF9F7]" />
                  考点「{located?.point || "本题"}」的思路已理过一遍
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FAF9F7]" />
                  变式题检验通过——是真会了
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FAF9F7]" />
                  {sediment ? "已收进心签，随时能翻回来" : "正在收进心签…"}
                </li>
              </ul>
              <TintButton
                tint={["#FAF9F7", "#FAF9F7", "#FAF9F7"]}
                outline
                onClick={reset}
                className="mt-4 w-full !border-[#FAF9F7]/60 !text-[#FAF9F7]"
              >
                再来一道
              </TintButton>
            </PanelCard>
          )}
        </>
      )}
    </div>
  );
}
