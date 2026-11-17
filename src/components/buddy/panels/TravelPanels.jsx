import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { useListSubtasks } from "@/components/buddy/useListSubtasks";
import { BuddyMsg, PanelCard, TintButton, useBuddyAgent, useBuddyState } from "./shared";

/**
 * 弹性行程（旅游搭子核心板块）：按认领档案（目的地/风格）LLM 生成逐日行程，
 * 每天留白 20% + 坑点提示；结果持久化在板块状态，可随时重排。途中说「今天累了」→ 重新生成后续。
 */
export function ItineraryPanel({ buddy, profile, tint, persona, projectTask = null }) {
  const { call } = useBuddyAgent("travel");
  const { state, patch } = useBuddyState("travel");
  const [generating, setGenerating] = useState(false);
  const [adjustInput, setAdjustInput] = useState("");

  const dest = profile?.answers?.dest || "目的地";
  const style = profile?.answers?.style || "躺平度假";
  const days = state.itinerary?.days || null;
  // 每一天行程 = 一条子约定，生成后自动落到项目约定下，约定列表里逐天勾选
  const itineraryItems = useMemo(
    () =>
      (days || []).map((d, i) => ({
        // 按天次做稳定 key：重新规划后更新原来的子约定，而不是每天再建一条
        key: `day-${i + 1}`,
        title: `${d.day || `D${i + 1}`} · ${d.title}`,
        description: d.note || "",
      })),
    [days]
  );
  const { childByKey, missingCount, syncing, autoError, syncNow } = useListSubtasks(
    projectTask,
    itineraryItems,
    "travel_itinerary"
  );

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
              const child = childByKey.get(`day-${i + 1}`);
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
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium text-stone-900">{d.title}</span>
                      {child && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: tint[0], color: tint[2] }}
                        >
                          {isTaskEffectivelyCompleted(child) ? "已完成" : "已列入约定"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{d.note}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="rounded-2xl bg-[#FAF9F7] p-3.5 text-[13px] leading-relaxed text-stone-600">
            途中随时喊我调整：「今天累了」→ 我立刻给出删减方案，不内耗。
          </p>

          {/* 行程 → 子约定：每天自动落成一条子约定，约定列表里逐天勾选 */}
          <div className="rounded-2xl bg-[#FAF9F7] p-3.5 text-[12px] leading-relaxed text-stone-500">
            {projectTask ? (
              <div className="flex items-center justify-between gap-3">
                <span>
                  {autoError
                    ? "行程同步没完成，点右侧重试。"
                    : missingCount > 0 || syncing
                      ? "正在把每日行程逐天列为子约定…"
                      : "每日行程已逐天列为子约定，勾选状态和约定列表同步。"}
                </span>
                {autoError ? (
                  <button
                    onClick={() => syncNow({ notify: true }).catch(() => {})}
                    className="shrink-0 underline underline-offset-2 hover:text-stone-700"
                  >
                    重试同步
                  </button>
                ) : (
                  <Link to={createPageUrl("Tasks")} className="shrink-0 text-[#384877] hover:underline">
                    去约定列表勾选 →
                  </Link>
                )}
              </div>
            ) : (
              <span>认领项目约定后，每日行程会自动逐天列为子约定，不用再记在攻略里。</span>
            )}
          </div>

          {/* 动态调整：时间 / 天气 / 人员状态 / 费用有变化，一句话重排后续行程 */}
          <PanelCard title="动态调整">
            <div className="mt-2.5 flex flex-wrap gap-2">
              {["今天累了", "下雨了", "预算有限", "有老人/小孩同行", "时间压缩一天"].map((chip) => (
                <button
                  key={chip}
                  onClick={() => generate(`动态调整：${chip}，请重排后续行程`)}
                  disabled={generating}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                  style={{ borderColor: tint[1], color: tint[2] }}
                >
                  {chip}
                </button>
              ))}
            </div>
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = adjustInput.trim();
                if (!v) return;
                setAdjustInput("");
                generate(`动态调整：${v}，请重排后续行程`);
              }}
            >
              <input
                value={adjustInput}
                onChange={(e) => setAdjustInput(e.target.value)}
                placeholder="说说情况变化：时间/天气/人员/费用…"
                className="min-h-[40px] flex-1 rounded-full border border-stone-200 bg-white px-4 text-[13px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
              />
              <TintButton tint={tint} outline className="!px-4 !min-h-[40px]" disabled={generating || !adjustInput.trim()}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : "重排"}
              </TintButton>
            </form>
          </PanelCard>
        </>
      )}
    </div>
  );
}

/** 当地灵感库：按认领目的地 LLM 生成（绝不串目的地）；一键「加进行前清单」 */
export function InspirationPanel({ buddy, profile, tint, projectTask = null }) {
  const { state, patch } = useBuddyState("travel");
  const { call } = useBuddyAgent("travel");
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const dest = String(profile?.answers?.dest || "").trim();
  const added = state.inspiration_added || [];
  // 只展示为本目的地生成的灵感；未认领目的地时展示示例（大理），并明确标注是示例
  const dynamicIdeas = dest && state.inspiration?.dest === dest ? state.inspiration.ideas : null;
  const staticIdeas = buddy.extras?.inspirations || [];
  const ideas = dynamicIdeas || (!dest ? staticIdeas : []);

  const generate = async () => {
    if (generating || !dest) return;
    setGenerating(true);
    try {
      const data = await call({ mode: "inspiration", payload: { dest } });
      if (!Array.isArray(data?.ideas) || data.ideas.length === 0) throw new Error("empty");
      patch({ inspiration: { dest, ideas: data.ideas, generated_at: new Date().toISOString() } });
    } catch (e) {
      toast.error(e?.message || "灵感没生成出来，再试一次");
    } finally {
      setGenerating(false);
    }
  };

  const add = (idea) => {
    if (added.includes(idea.name)) return;
    const title = `${idea.name}（灵感）`;
    patch({
      inspiration_added: [...added, idea.name],
      checklist_extra: [...(state.checklist_extra || []), title],
    });
    // 立刻落成子约定，不必等用户切到「清单」页再同步
    if (projectTask) {
      httpRequest("/api/tasks", {
        method: "POST",
        body: {
          title,
          description: "行前清单 · 来自旅游搭子",
          category: "personal",
          priority: "medium",
          parent_task_id: projectTask.id,
          buddy_list_source: "travel_checklist",
        },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["tasks"] }))
        .catch(() => {});
    }
    toast.success(`已加进行前清单：${idea.name}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold text-stone-900">
          {dest ? `「${dest}」当地灵感` : "本地灵感"}
        </h2>
        {dest && dynamicIdeas && (
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} /> 换一批
          </button>
        )}
      </div>
      {dest && !dynamicIdeas ? (
        <PanelCard>
          <div className="py-4 text-center">
            <p className="text-sm text-stone-500">还没有「{dest}」的当地灵感。让搭子按目的地给你找真正值得去的？</p>
            <TintButton tint={tint} onClick={generate} disabled={generating} className="mt-4 w-full">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `生成「${dest}」当地灵感`}
            </TintButton>
          </div>
        </PanelCard>
      ) : (
        <>
          {!dest && (
            <p className="px-1 text-xs text-stone-400">示例（大理）。认领时告诉搭子你的目的地，灵感会换成你要去的地方。</p>
          )}
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
        </>
      )}
    </div>
  );
}
