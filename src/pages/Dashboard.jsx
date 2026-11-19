import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { createPageUrl } from "@/utils";
import assistantPlanet from "@/assets/assistant-planet.png";
import AssistantWidget from "@/components/assistant/AssistantWidget";
import BuddyCompanions from "@/components/buddy/BuddyCompanions";
import BuddyStoreStrip from "@/components/buddy/BuddyStoreStrip";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { PERSONAS, DEFAULT_PERSONA, BUDDIES } from "@/lib/buddies";

/**
 * 首页：通用 Agent 对话层（与样例一致）
 * —— 对话框（说事、记事、办事）+ 进行中的陪伴 + 搭子Store 常驻入口。
 * 场景之内有搭子，场景之外有我。
 */
const clip = (text, max = 14) => {
  const s = String(text || "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "home"],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: "all" }, "-created_date", 2000),
    initialData: [],
  });
  const { data: notesList = [] } = useQuery({
    queryKey: ["notes", "home"],
    queryFn: () => base44.entities.Note.list("-created_date", 100).catch(() => []),
    initialData: [],
  });
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine").catch(() => null),
  });
  const persona = mine?.persona || DEFAULT_PERSONA;
  const personaName = PERSONAS.find((p) => p.key === persona)?.name || "温柔陪伴型";
  const claimedCount = Object.values(mine?.buddies || {}).filter((b) => b?.status === "active").length;

  // 今日印记：全部来自真实数据——今日待赴约 / 守护中的约定 / 心签
  const imprint = useMemo(() => {
    const alive = allTasks.filter((t) => !t.deleted_at);
    const roots = alive.filter((t) => !t.parent_task_id);
    const guarding = roots.filter((t) => !isTaskEffectivelyCompleted(t)).length;
    const todayStr = new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const pendingTodayTasks = roots.filter((t) => {
      if (isTaskEffectivelyCompleted(t)) return false;
      if (!t.reminder_time) return false;
      const d = new Date(new Date(t.reminder_time).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      return d <= todayStr;
    });
    return { todayPending: pendingTodayTasks.length, guarding, notes: notesList.length, pendingTodayTasks };
  }, [allTasks, notesList]);

  const activeBuddies = useMemo(
    () => BUDDIES.filter((b) => mine?.buddies?.[b.id]?.status === "active"),
    [mine]
  );

  const hour = new Date().getHours();
  const dayGreeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const name = user?.full_name || user?.display_name || "";
  const isNewUser = imprint.guarding === 0 && imprint.notes === 0 && claimedCount === 0;

  // 今日唯一问候：按真实约定/心签/搭子实时生成，不写进聊天记录，
  // 也不在用户开口前主动追加消息。
  const greetingText = useMemo(() => {
    if (isNewUser) {
      return "今天想做点什么？日程、情绪、随便聊聊都可以找我；如果有个想长期推进的目标，我帮你找个专业搭子。";
    }
    const parts = [`${dayGreeting}${name ? `，${name}` : ""}。`];
    if (imprint.pendingTodayTasks.length > 0) {
      const titles = imprint.pendingTodayTasks.slice(0, 3).map((t) => `「${clip(t.title, 12)}」`).join("、");
      parts.push(`今天有 ${imprint.todayPending} 件约定要赴：${titles}${imprint.todayPending > 3 ? " 等" : ""}。`);
    } else {
      parts.push(
        imprint.guarding > 0
          ? `今天没有到点的约定，${imprint.guarding} 件在守护中。`
          : "今天还没有排约定。"
      );
    }
    if (imprint.notes > 0) parts.push(`心签已沉淀 ${imprint.notes} 条。`);
    if (activeBuddies.length > 0) parts.push(`${activeBuddies.map((b) => b.name).join("、")}在岗。`);
    parts.push("想先排今天的安排，还是先聊两句？");
    return parts.join("");
  }, [isNewUser, dayGreeting, name, imprint, activeBuddies]);

  // 「和心栈说事」快捷条目：每条都从真实约定 / 心签 / 搭子 / 项目里长出来
  const quickAsks = useMemo(() => {
    const asks = [];
    const pending = imprint.pendingTodayTasks;
    if (pending.length > 0) {
      asks.push({
        label: `安排今天的 ${pending.length} 件约定`,
        prompt: `帮我安排今天这几件约定：${pending.slice(0, 4).map((t) => `「${clip(t.title, 16)}」`).join("、")}。先做什么、后做什么，给我一个具体顺序。`,
      });
    } else {
      asks.push({
        label: "看看我现在的约定",
        prompt: "帮我看看我现在所有的约定，今天最该先做什么？",
      });
    }
    if (notesList.length > 0) {
      asks.push({
        label: `回顾最近 ${Math.min(notesList.length, 5)} 条心签`,
        prompt: `帮我回顾最近的心签，看看有什么共同主题：${notesList
          .slice(0, 5)
          .map((n) => `「${clip(n.title || n.plain_text, 16)}」`)
          .join("、")}。给我一个下一步建议。`,
      });
    }
    if (activeBuddies.length > 0) {
      const buddy = activeBuddies[0];
      const planTitle = mine?.buddies?.[buddy.id]?.plan_title;
      asks.push({
        label: `看看${buddy.name}的下一步`,
        prompt: `帮我看看${buddy.name}这边「${planTitle || buddy.name}」的进度，下一步该做什么？`,
      });
    }
    const collabSource =
      pending[0] ||
      allTasks.find((t) => !t.deleted_at && !t.parent_task_id && !isTaskEffectivelyCompleted(t));
    if (collabSource) {
      asks.push({
        label: `把「${clip(collabSource.title, 14)}」变成协同约定`,
        prompt: `帮我创建一个以「${clip(collabSource.title, 30)}」为主题的协同约定，和朋友一起推进。`,
      });
    } else {
      asks.push({
        label: "拉个协同约定，和朋友一起推进",
        prompt: "帮我创建一个协同约定，和朋友一起推进。",
      });
    }
    asks.push({
      label: "去网页上帮我办件事",
      prompt: "帮我查一下明天从北京到上海的高铁，给我两个可选车次；如果需要登录或支付，再停下来问我。",
    });
    return asks.slice(0, 6);
  }, [imprint, notesList, activeBuddies, mine, allTasks]);

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-24 font-sans text-[#1c1917]">
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 pt-6 md:pt-10">
        {/* 页眉：人格模式行 */}
        <header className="flex items-center justify-between px-1">
          <div>
            <div className="text-lg font-semibold tracking-wide">SoulSentry</div>
            <div className="text-xs text-[#a8a29e]">{personaName}模式 · 我一直都在</div>
          </div>
          <img src={assistantPlanet} alt="心栈小助手" className="w-11 h-11 rounded-full object-cover" />
        </header>

        {/* PC：左列对话层（更宽更高），右列问候 + 陪伴 + Store；手机：保持样例纵向流 */}
        <div className="lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-8 lg:items-start">
          {/* 通用 Agent 对话层：内容输入的第一板块——说事、记事、办事，确认后落库。
              新用户给引导输入，老用户先给今日总结再给模版 */}
          <section className="mt-4 px-1">
            <AssistantWidget
              inline
              newUser={isNewUser}
              summary={greetingText}
              quickAsks={quickAsks}
            />
          </section>

          <div className="lg:mt-4">
            {/* 心栈的问候 + 今日印记（真实数据的一行播报） */}
            <div className="mx-1 mt-4 lg:mt-0 flex items-start gap-3 rounded-2xl bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(36,36,36,0.06)] border border-stone-200/60">
              <div className="mt-0.5 shrink-0">
                <img src={assistantPlanet} alt="心栈小助手" className="w-9 h-9 rounded-full object-cover" />
              </div>
              <div>
                <p className="text-[15px] leading-relaxed">
                  {dayGreeting}{name ? `，${name}` : ""}。今天想做点什么？日程、情绪、随便聊聊都可以找我；
                  {claimedCount > 0 ? "你的搭子们也在各自的岗位上待命。" : "如果有个想长期推进的目标，我帮你找个专业搭子。"}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#a8a29e]">
                  今日印记：
                  <Link to={createPageUrl("Tasks")} className="hover:text-[#384877]">
                    {imprint.todayPending} 条约定今日待赴约
                  </Link>
                  {" · "}
                  <Link to={createPageUrl("Tasks")} className="hover:text-[#384877]">
                    {imprint.guarding} 条约定守护中
                  </Link>
                  {" · "}
                  <Link to={createPageUrl("Notes")} className="hover:text-[#384877]">
                    {imprint.notes} 条心签已沉淀
                  </Link>
                </p>
              </div>
            </div>

            {/* 进行中的陪伴（搭子list） */}
            <BuddyCompanions />

            {/* 搭子Store 常驻入口 */}
            <BuddyStoreStrip />
          </div>
        </div>
      </div>
    </div>
  );
}
