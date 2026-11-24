import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { useListSubtasks } from "@/components/buddy/useListSubtasks";
import { PanelCard, TintButton, useBuddyAgent, useBuddyState } from "./shared";
import BuddyChatPanel from "./BuddyChatPanel";

function resolveTravelDestination(profile, state) {
  const raw = String(state?.itinerary?.dest || profile?.answers?.dest || "").trim();
  const dayMatch = raw.match(/(\d+)\s*(天|日)/);
  const dest = raw.replace(/[\s·-]*\d+\s*(天|日)\s*$/, "").trim();
  return { raw, dest: dest && dest !== "目的地" ? dest : "", dayMatch };
}

function resolveTravelStyle(profile, state, note = "") {
  return (
    state?.itinerary?.style ||
    profile?.answers?.style ||
    (/(暴走|打卡)/.test(note) ? "暴走打卡" : /(人文|博物馆|历史)/.test(note) ? "深度人文" : "躺平度假")
  );
}

function itineraryIntensity(day) {
  const text = `${day?.title || ""}${day?.note || ""}`;
  if (/(登山|徒步|暴走|全天|长途|高强度|爬|骑行)/.test(text)) return 88;
  if (/(休息|自由|躺平|咖啡|发呆|慢|闲逛|温泉)/.test(text)) return 34;
  return 60;
}

function ItineraryArtifact({ itinerary, tint, generating, canSync, childByKey, missingCount, syncing, autoError, onRetrySync }) {
  const days = itinerary?.days || [];
  const syncLabel = !canSync
    ? "已收进搭子空间"
    : autoError
      ? "同步约定失败"
      : syncing || missingCount > 0
        ? "正在同步到约定"
        : "已同步到约定";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] tracking-widest text-stone-400">行程图</span>
        {autoError && canSync && !generating ? (
          <button
            type="button"
            onClick={onRetrySync}
            className="text-[10px] text-amber-600 underline underline-offset-2"
          >
            {syncLabel} · 重试
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-stone-400">
            {generating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> 正在重排
              </>
            ) : (
              syncLabel
            )}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-[15px] font-semibold text-stone-900">
          {itinerary?.dest} · {days.length}天
        </h3>
        {itinerary?.style && <span className="text-[11px] text-stone-400">{itinerary.style}</span>}
      </div>

      {/* 每日节奏图：每根柱代表一天，越高安排越满 */}
      <div className="mt-3 flex items-end gap-1.5" aria-label="每日行程强度图">
        {days.map((d, i) => (
          <div key={`bar-${i}`} className="min-w-0 flex-1 text-center">
            <div className="relative h-12 overflow-hidden rounded-md bg-[#F3F1EC]">
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-md transition-[height] duration-500"
                style={{ height: `${itineraryIntensity(d)}%`, background: tint[2], opacity: i === 0 ? 1 : 0.7 }}
              />
            </div>
            <div className="mt-1 whitespace-nowrap text-[9px] leading-none text-stone-400">{d.day || `D${i + 1}`}</div>
            <div className="mt-0.5 line-clamp-2 min-h-[22px] text-[9px] leading-tight text-stone-500">{d.title}</div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-stone-400">每日节奏 · 柱越高安排越满</p>

      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-[10px] text-stone-400 [&::-webkit-details-marker]:hidden">
          <span>展开每天安排</span>
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1.5 space-y-1.5">
          {days.map((d, i) => {
            const child = childByKey?.get(`day-${i + 1}`);
            return (
              <div key={`day-${i}`} className="flex gap-2.5 rounded-xl bg-[#FAF9F7] px-2.5 py-2">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: tint[0], color: tint[2] }}
                >
                  {d.day || `D${i + 1}`}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium text-stone-800">{d.title}</span>
                    {child && (
                      <span className="shrink-0 text-[9px] text-stone-400">
                        {isTaskEffectivelyCompleted(child) ? "已完成" : "已列入约定"}
                      </span>
                    )}
                  </div>
                  {d.note && <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{d.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      <p className="mt-2 text-[10px] leading-relaxed text-stone-400">
        想改哪天，直接在下面聊天框说「今天累了」「下雨了」「预算有限」。
      </p>
    </div>
  );
}

/**
 * 旅游搭子的第一栏：只保留一个聊天输入口。
 * 认领后自动把行程排进对话；之后用户每一句调整（累了/下雨/预算…）都直接触发重排，
 * 行程以柱状节奏图 + 逐日图文卡片的形式留在聊天面板里，不再有第二套生成/调整按钮。
 */
export function TravelChatPanel({ buddy, profile, tint, projectTask = null }) {
  const { call } = useBuddyAgent("travel");
  const { state, patch } = useBuddyState("travel");
  const [generating, setGenerating] = useState(false);
  const generatingRef = useRef(false);
  const autoTriedRef = useRef(false);

  const days = state.itinerary?.days || null;
  const itineraryItems = useMemo(
    () =>
      (days || []).map((d, i) => ({
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

  const generateItinerary = async (note) => {
    if (generatingRef.current) {
      toast.info("上一版还在重排，等它出来再改这一句");
      return;
    }
    const { dest, dayMatch: destDayMatch } = resolveTravelDestination(profile, state);
    if (!dest) {
      toast.info("先告诉我目的地，我就能把行程排进对话里");
      return;
    }
    const existingDays = days?.length || 0;
    const textDayMatch = String(note || "").match(/(\d+)\s*(天|日)/);
    const totalDays = Math.max(2, Math.min(9, Number(textDayMatch?.[1] || existingDays || destDayMatch?.[1] || 5)));
    const style = resolveTravelStyle(profile, state, note);

    // 已有行程时把当前版本带进 prompt，让模型只改受影响的部分，而不是推倒重来
    const currentPlan = (days || [])
      .map((d, i) => `${d.day || `D${i + 1}`} ${d.title}：${d.note || ""}`)
      .join("\n");
    const finalNote = currentPlan
      ? `当前行程：\n${currentPlan}\n\n用户的新要求：${String(note || "").trim() || "按当前方向优化"}\n请保留合适的部分，只调整需要改的地方，输出完整逐日行程。`
      : String(note || "").trim();

    generatingRef.current = true;
    setGenerating(true);
    try {
      const data = await call({
        mode: "itinerary",
        payload: { dest, style, days: totalDays, note: finalNote },
      });
      if (!Array.isArray(data?.days) || data.days.length === 0) throw new Error("empty");
      patch({
        itinerary: {
          dest,
          style,
          days: data.days.slice(0, totalDays),
          generated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("[travel itinerary]", error);
      toast.error("行程暂时没排出来，在聊天框说「重新排一版」再试");
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const shouldGenerateFromChat = (text) => {
    const t = String(text || "").trim();
    if (!t) return false;
    const hasItinerary = Boolean(days?.length);
    const explicit = /(重新规划|重新排|再排一版|生成行程|排一版|改行程|调整行程)/.test(t);
    const adjustment = /(累了|下雨|天气不好|天气变了|预算有限|预算不够|超预算|压低预算|预算紧张|调整|改|换|删|加上|提前|推迟|压缩|老人|小孩|不想去|少走|多留|太赶|太满)/.test(t);
    const creation = /(行程|攻略|安排|规划|计划|路线|几天|\d+\s*[天日]|想去|去.{0,10}玩|帮我排)/.test(t);
    return explicit || (hasItinerary ? adjustment : creation);
  };

  const handleAfterSend = ({ text }) => {
    if (!shouldGenerateFromChat(text)) return;
    generateItinerary(`用户刚在对话里说：${text}`);
  };

  // 认领后第一次进入旅游搭子：按认领答案自动把行程排进聊天，不再需要单独的「生成行程」按钮
  useEffect(() => {
    if (autoTriedRef.current) return;
    if (!resolveTravelDestination(profile, state).dest || days?.length) return;
    autoTriedRef.current = true;
    const timer = setTimeout(() => {
      generateItinerary("按我认领时说的目的地、天数和风格，先排一版弹性行程");
    }, 700);
    return () => clearTimeout(timer);
  }, [profile?.answers?.dest, days?.length]);

  const artifact = days?.length ? (
    <ItineraryArtifact
      itinerary={state.itinerary}
      tint={tint}
      generating={generating}
      canSync={Boolean(projectTask)}
      childByKey={childByKey}
      missingCount={missingCount}
      syncing={syncing}
      autoError={autoError}
      onRetrySync={() => syncNow({ notify: true }).catch(() => {})}
    />
  ) : (
    <div className="rounded-2xl border border-dashed border-stone-200 bg-[#FAF9F7] px-3.5 py-3 text-[12px] leading-relaxed text-stone-500">
      {generating ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在按你说的排行程…
        </span>
      ) : resolveTravelDestination(profile, state).dest ? (
        "正在按你的目的地排一版弹性行程，马上放进对话里。"
      ) : (
        "告诉我目的地、天数和想要的节奏，我直接在对话里把行程排出来。"
      )}
    </div>
  );

  return (
    <BuddyChatPanel
      buddy={buddy}
      profile={profile}
      tint={tint}
      projectTask={projectTask}
      artifacts={artifact}
      onAfterSend={handleAfterSend}
    />
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
