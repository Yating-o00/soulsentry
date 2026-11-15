import React, { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BuddyMsg, PanelCard, TintButton, useBuddyAgent, useBuddyState } from "./shared";

/**
 * 弹性行程（旅游搭子核心板块）：按认领档案（目的地/风格）LLM 生成逐日行程，
 * 每天留白 20% + 坑点提示；结果持久化在板块状态，可随时重排。途中说「今天累了」→ 重新生成后续。
 */
export function ItineraryPanel({ buddy, profile, tint, persona }) {
  const { call } = useBuddyAgent("travel");
  const { state, patch } = useBuddyState("travel");
  const [generating, setGenerating] = useState(false);

  const dest = profile?.answers?.dest || "目的地";
  const style = profile?.answers?.style || "躺平度假";
  const days = state.itinerary?.days || null;

  const greeting = {
    gentle: "行程不用赶，每天只排两件事，累了我们就砍。",
    strict: "行程按节奏排好了，强度最大的那天我会提前提醒你早睡。",
    buddy: "攻略我全包了！你只管期待——看看每天适合干啥？",
  };

  const generate = async (note) => {
    if (generating) return;
    setGenerating(true);
    try {
      const data = await call({ mode: "itinerary", payload: { dest, style, days: 5, note } });
      if (!Array.isArray(data?.days) || data.days.length === 0) throw new Error("empty");
      patch({ itinerary: { dest, style, days: data.days, generated_at: new Date().toISOString() } });
    } catch (e) {
      toast.error(e?.message || "行程没排出来，再试一次");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <BuddyMsg tint={tint}>{greeting[persona] || greeting.gentle}</BuddyMsg>

      {!days ? (
        <PanelCard>
          <div className="py-4 text-center">
            <p className="text-sm text-stone-500">
              还没有行程。按「{dest} · {style}」给你排一版弹性行程？
            </p>
            <TintButton tint={tint} onClick={() => generate()} disabled={generating} className="mt-4 w-full">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `生成「${dest}」弹性行程`}
            </TintButton>
          </div>
        </PanelCard>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold text-stone-900">
              {state.itinerary.dest} · 弹性行程
            </h2>
            <button
              onClick={() => generate("重新规划：保留精华，调整节奏")}
              disabled={generating}
              className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"
            >
              <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} /> 重新规划
            </button>
          </div>
          <div className="space-y-0">
            {days.map((d, i) => {
              const isFirst = i === 0;
              return (
                <div key={`${d.day}-${i}`} className="relative flex gap-3.5 pb-4 pl-1">
                  <div className="flex flex-col items-center">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      style={{ background: isFirst ? tint[2] : tint[0], color: isFirst ? "#fff" : tint[2] }}
                    >
                      {d.day || `D${i + 1}`}
                    </span>
                    {i < days.length - 1 && <span className="mt-1 w-px flex-1" style={{ background: tint[1] }} />}
                  </div>
                  <div className={`flex-1 rounded-2xl p-3.5 ${isFirst ? "bg-white border border-stone-200" : "bg-[#FAF9F7]"}`}>
                    <span className="text-[15px] font-medium text-stone-900">{d.title}</span>
                    <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{d.note}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="rounded-2xl bg-[#FAF9F7] p-3.5 text-[13px] leading-relaxed text-stone-600">
            途中随时喊我调整：「今天累了」→ 我立刻给出删减方案，不内耗。
          </p>
        </>
      )}
    </div>
  );
}

/** 本地灵感库：一键「加进行前清单」——灵感会变成清单里要准备的事项 */
export function InspirationPanel({ buddy, tint }) {
  const { state, patch } = useBuddyState("travel");
  const ideas = buddy.extras?.inspirations || [];
  const added = state.inspiration_added || [];

  const add = (idea) => {
    if (added.includes(idea.name)) return;
    patch({
      inspiration_added: [...added, idea.name],
      checklist_extra: [...(state.checklist_extra || []), `${idea.name}（灵感）`],
    });
    toast.success(`已加进行前清单：${idea.name}`);
  };

  return (
    <div className="space-y-3">
      <h2 className="px-1 text-base font-semibold text-stone-900">本地灵感</h2>
      {ideas.map((idea) => {
        const isAdded = added.includes(idea.name);
        return (
          <PanelCard key={idea.name}>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: tint[0], color: tint[2] }}>
                {idea.kind}
              </span>
              <span className="text-[15px] font-medium text-stone-900">{idea.name}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{idea.desc}</p>
            <TintButton tint={tint} outline={!isAdded} onClick={() => add(idea)} disabled={isAdded} className="mt-3 w-full">
              {isAdded ? "已进行前清单" : "＋ 加入行前清单"}
            </TintButton>
          </PanelCard>
        );
      })}
    </div>
  );
}
