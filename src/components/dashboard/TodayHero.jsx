import React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

/** 今日页顶部深色主视觉：问候 + 今日一句话 + 关键数字 + 统一输入口 */
export default function TodayHero({ greeting, name, focusTask, todayCount, activeCount, noteCount, children }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1e2a4a] via-[#243358] to-[#2f4170] text-white px-5 py-7 md:px-12 md:py-10 shadow-xl shadow-[#1e2a4a]/20">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5 blur-3xl pointer-events-none" />
      <div className="relative max-w-3xl mx-auto">
        <div className="flex items-center justify-between text-[11px] md:text-xs tracking-[0.15em] text-white/50">
          <span>{format(new Date(), "yyyy年MM月dd日 EEEE", { locale: zhCN })}</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />记忆值守中
          </span>
        </div>
        <h1 className="mt-4 text-2xl md:text-4xl font-semibold tracking-tight">{greeting}，{name}</h1>
        <p className="mt-3 text-sm md:text-[15px] leading-relaxed text-white/70">
          {focusTask
            ? <>今天记得：「{focusTask}」。除此之外，其余的都已被妥善记住，你只管从容去过。</>
            : "今天还没有需要记挂的事。有任何想法，随时告诉我。"}
        </p>
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-1 text-xs md:text-sm text-white/60">
          <span>今日已被记住 <b className="text-white tabular-nums">{todayCount}</b> 件</span>
          <span>守护中的约定 <b className="text-white tabular-nums">{activeCount}</b> 个</span>
          <span>心签 <b className="text-white tabular-nums">{noteCount}</b> 枚</span>
        </div>
        <div className="mt-6 text-slate-900">{children}</div>
      </div>
    </section>
  );
}