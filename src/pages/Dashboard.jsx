import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { createPageUrl } from "@/utils";
import xinzhanOrb from "@/assets/xinzhan-orb.jpg";
import AssistantWidget from "@/components/assistant/AssistantWidget";
import BuddyCompanions from "@/components/buddy/BuddyCompanions";
import BuddyStoreStrip from "@/components/buddy/BuddyStoreStrip";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { PERSONAS, DEFAULT_PERSONA } from "@/lib/buddies";

/**
 * 首页：通用 Agent 对话层（与样例一致）
 * —— 对话框（说事、记事、办事）+ 进行中的陪伴 + 搭子Store 常驻入口。
 * 场景之内有搭子，场景之外有我。
 */
export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "home"],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: "all" }, "-reminder_time", 300),
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
    const todayPending = roots.filter((t) => {
      if (isTaskEffectivelyCompleted(t)) return false;
      if (!t.reminder_time) return false;
      const d = new Date(new Date(t.reminder_time).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      return d <= todayStr;
    }).length;
    return { todayPending, guarding, notes: notesList.length };
  }, [allTasks, notesList]);

  // 今日印记播报：每天首次进入首页时，由心栈把当天安排作为对话的第一句话（真实数据，非模板文案）
  useEffect(() => {
    const today = new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const key = `ss_imprint_echo_${today}`;
    if (localStorage.getItem(key)) return;
    if (imprint.guarding === 0 && imprint.notes === 0) return; // 新用户没有数据，不打扰
    localStorage.setItem(key, "1");
    const week = ["日", "一", "二", "三", "四", "五", "六"][new Date().getDay()];
    const now = new Date();
    const text =
      `${dayGreeting}${name ? `，${name}` : ""}。今天是 ${now.getMonth() + 1} 月 ${now.getDate()} 日，星期${week}。\n` +
      `今日印记：${imprint.todayPending} 条约定今日待赴约，${imprint.guarding} 条约定守护中，${imprint.notes} 条心签已沉淀。\n` +
      `说事、记事、办事，随时找我。`;
    httpRequest("/api/companion/messages", { method: "POST", body: { assistant_echo: text } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imprint.guarding, imprint.todayPending, imprint.notes]);

  const hour = new Date().getHours();
  const dayGreeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const name = user?.full_name || user?.display_name || "";

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-24 font-sans text-[#1c1917]">
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 pt-6 md:pt-10">
        {/* 页眉：人格模式行 */}
        <header className="flex items-center justify-between px-1">
          <div>
            <div className="text-lg font-semibold tracking-wide">SoulSentry</div>
            <div className="text-xs text-[#a8a29e]">{personaName}模式 · 我一直都在</div>
          </div>
          <img src={xinzhanOrb} alt="心栈" className="w-11 h-11 rounded-full object-cover" />
        </header>

        {/* PC：左列对话层（更宽更高），右列问候 + 陪伴 + Store；手机：保持样例纵向流 */}
        <div className="lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-8 lg:items-start">
          {/* 通用 Agent 对话层：内容输入的第一板块——说事、记事、办事，确认后落库。
              新用户给引导输入，老用户先给今日总结再给模版 */}
          <section className="mt-4 px-1">
            <AssistantWidget
              inline
              newUser={imprint.guarding === 0 && imprint.notes === 0 && claimedCount === 0}
              summary={`欢迎回来${name ? `，${name}` : ""}。今日印记：${imprint.todayPending} 条约定今日待赴约，${imprint.guarding} 条守护中，${imprint.notes} 条心签已沉淀。想从哪件开始，还是先说点别的？`}
            />
          </section>

          <div className="lg:mt-4">
            {/* 心栈的问候 + 今日印记（真实数据的一行播报） */}
            <div className="mx-1 mt-4 lg:mt-0 flex items-start gap-3 rounded-2xl bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(36,36,36,0.06)] border border-stone-200/60">
              <div className="mt-0.5 shrink-0">
                <img src={xinzhanOrb} alt="心栈" className="w-9 h-9 rounded-full object-cover" />
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
