import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { createPageUrl } from "@/utils";
import Orb from "@/components/buddy/Orb";
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

  const hour = new Date().getHours();
  const dayGreeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const name = user?.full_name || user?.display_name || "";

  return (
    <div className="min-h-screen bg-[#f2efe9] pb-24 font-sans text-[#242424]">
      <div className="max-w-2xl mx-auto px-4 pt-6 md:pt-10">
        {/* 页眉：人格模式行 */}
        <header className="flex items-center justify-between px-1">
          <div>
            <div className="text-lg font-semibold tracking-wide">SoulSentry</div>
            <div className="text-xs text-[#8a867e]">{personaName}模式 · 我一直都在</div>
          </div>
          <Orb size={44} />
        </header>

        {/* 心栈的问候（通用层，不绑定场景） */}
        <div className="mx-1 mt-3 flex items-start gap-3 rounded-2xl bg-[#faf8f3] p-4 shadow-[0_1px_2px_rgba(36,36,36,0.06)]">
          <div className="mt-0.5 shrink-0">
            <Orb size={36} />
          </div>
          <div>
            <p className="text-[15px] leading-relaxed">
              {dayGreeting}{name ? `，${name}` : ""}。今天想做点什么？日程、情绪、随便聊聊都可以找我；
              {claimedCount > 0 ? "你的搭子们也在各自的岗位上待命。" : "如果有个想长期推进的目标，我帮你找个专业搭子。"}
            </p>
            {/* 今日印记：真实数据的一行播报 */}
            <p className="mt-2 text-xs leading-relaxed text-[#8a867e]">
              今日印记：
              <Link to={createPageUrl("Tasks")} className="hover:text-[#9a6b3c]">
                {imprint.todayPending} 条约定今日待赴约
              </Link>
              {" · "}
              <Link to={createPageUrl("Tasks")} className="hover:text-[#9a6b3c]">
                {imprint.guarding} 条约定守护中
              </Link>
              {" · "}
              <Link to={createPageUrl("Notes")} className="hover:text-[#9a6b3c]">
                {imprint.notes} 条心签已沉淀
              </Link>
            </p>
          </div>
        </div>

        {/* 通用 Agent 对话层：不认领搭子也能把事办了（约定/心签/计划/协同/执行，确认后落库） */}
        <section className="mt-5 px-1">
          <AssistantWidget inline />
        </section>

        {/* 进行中的陪伴（搭子list） */}
        <BuddyCompanions />

        {/* 搭子Store 常驻入口 */}
        <BuddyStoreStrip />
      </div>
    </div>
  );
}
