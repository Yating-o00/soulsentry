import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, DEFAULT_PERSONA, getBuddy } from "@/lib/buddies";

// 通用认领流 —— 同一套对话引擎，由每颗搭子的配置驱动（问题 → 弹性计划卡 → 项目制绑定）
export default function BuddyClaim() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const buddyId = new URLSearchParams(location.search).get("buddy") || "";
  const buddy = getBuddy(buddyId);
  const tint = BUDDY_TINTS[buddyId] || BUDDY_TINTS.study;

  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const persona = mine?.persona || DEFAULT_PERSONA;

  const questions = useMemo(() => buddy?.questions || [], [buddy]);
  const [step, setStep] = useState(0);
  const [msgs, setMsgs] = useState([]); // { who: 'buddy'|'user', text }
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [answers, setAnswers] = useState({});
  const [showPlan, setShowPlan] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const scrollRef = useRef(null);
  const timersRef = useRef([]);

  // 开场：搭子按当前人格自我介绍 + 第一个问题
  useEffect(() => {
    if (!buddy || questions.length === 0) return;
    timersRef.current = [
      setTimeout(() => {
        setMsgs([{ who: "buddy", text: `嗨，我是你的${buddy.name}。${buddy.greeting[persona] || buddy.greeting.gentle}` }]);
      }, 300),
      setTimeout(() => setTyping(true), 1000),
      setTimeout(() => {
        setTyping(false);
        setMsgs((m) => [...m, { who: "buddy", text: questions[0].ask }]);
      }, 1800),
    ];
    return () => timersRef.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buddyId, persona]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" });
    });
  }, [msgs, typing, step, showPlan]);

  if (!buddy) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-stone-500 text-sm">这颗搭子还没有来到货架。</p>
        <button
          onClick={() => navigate(createPageUrl("BuddyStore"))}
          className="mt-4 rounded-full border border-stone-900 px-6 py-2.5 text-sm text-stone-900"
        >
          回搭子Store
        </button>
      </div>
    );
  }

  const currentQ = step < questions.length ? questions[step] : null;
  const userMsgCount = msgs.filter((m) => m.who === "user").length;
  const awaitingAnswer = !typing && !showPlan && currentQ && userMsgCount === step;

  const answer = (v) => {
    const q = questions[step];
    const nextAnswers = { ...answers, [q.key]: v };
    setAnswers(nextAnswers);
    setMsgs((m) => [...m, { who: "user", text: v }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      if (step + 1 < questions.length) {
        setMsgs((m) => [...m, { who: "buddy", text: questions[step + 1].ask }]);
        setStep(step + 1);
      } else {
        setMsgs((m) => [...m, { who: "buddy", text: "都清楚了。计划我排好了——弹性优先，不排满。看看？" }]);
        setShowPlan(true);
      }
    }, 900);
  };

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      await httpRequest(`/api/buddies/${buddy.id}/claim`, {
        method: "POST",
        body: {
          answers,
          plan_title: buddy.planTitle(answers),
          plan_lines: buddy.planLines(answers),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`${buddy.name}开始陪你了`);
      navigate(`${createPageUrl("BuddySpace")}?buddy=${buddy.id}`);
    } catch (e) {
      if (e?.status === 409) {
        toast("这颗搭子已经在陪你啦");
        navigate(`${createPageUrl("BuddySpace")}?buddy=${buddy.id}`);
      } else {
        toast.error(e?.message || "认领失败，请再试一次");
        setClaiming(false);
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 md:py-10 flex flex-col" style={{ minHeight: "70vh" }}>
      {/* 页眉 */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(createPageUrl("BuddyStore"))}
            aria-label="返回"
            className="flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="text-base font-semibold text-stone-900">认领{buddy.name}</div>
            <div className="text-xs text-stone-400">1 分钟，让 ta 了解你</div>
          </div>
        </div>
        <Orb size={40} tint={tint} />
      </header>

      {/* 对话流 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-6">
        {msgs.map((m, i) =>
          m.who === "buddy" ? (
            <div key={i} className="flex items-end gap-2.5">
              <Orb size={32} tint={tint} />
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white border border-stone-200 px-4 py-3 text-[14px] leading-relaxed text-stone-700">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-stone-900 px-4 py-3 text-[14px] leading-relaxed text-[#f2efe9]">
                {m.text}
              </div>
            </div>
          )
        )}
        {typing && (
          <div className="flex items-end gap-2.5">
            <Orb size={32} tint={tint} />
            <div className="rounded-2xl rounded-bl-sm bg-white border border-stone-200 px-4 py-3 text-stone-400 text-sm">
              …
            </div>
          </div>
        )}

        {/* 快捷选项 */}
        {awaitingAnswer && currentQ.chips && (
          <div className="flex flex-wrap gap-2 pl-11">
            {currentQ.chips.map((c) => (
              <button
                key={c}
                onClick={() => answer(c)}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-[13px] text-stone-700 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-[#f2efe9]"
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* 自由输入（该问题允许时） */}
        {awaitingAnswer && currentQ.allowInput && (
          <form
            className="flex gap-2 pl-11"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                answer(input.trim());
                setInput("");
              }
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="或者，自己说一个…"
              className="min-h-[44px] flex-1 rounded-full border border-stone-300 bg-white px-4 text-[15px] text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-full bg-stone-900 px-4 text-sm text-[#f2efe9] transition-transform active:scale-95"
            >
              发送
            </button>
          </form>
        )}

        {/* 生成的计划卡 */}
        {showPlan && (
          <div className="ml-11 rounded-2xl bg-stone-900 p-5 text-[#f2efe9]">
            <div className="text-xs tracking-widest" style={{ color: tint[1] }}>
              弹性计划 · 留白 20%
            </div>
            <div className="mt-1.5 text-lg font-semibold">{buddy.planTitle(answers)}</div>
            <ul className="mt-4 space-y-2.5">
              {buddy.planLines(answers).map((l) => (
                <li key={l} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint[1] }} />
                  {l}
                </li>
              ))}
            </ul>
            <button
              onClick={claim}
              disabled={claiming}
              className="mt-5 min-h-[48px] w-full rounded-full bg-[#f2efe9] px-4 font-medium text-stone-900 transition-transform duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            >
              {claiming ? "正在开启…" : "开启这段陪伴"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
