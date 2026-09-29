import React from "react";
import { subDays, isSameDay, parseISO, isAfter, format } from "date-fns";
import { zhCN } from "date-fns/locale";

/** 近 7 天回望：被记住的时刻 / 心签 / 兑现 / 守护中 + 每日兑现柱状 */
export default function WeekReviewCard({ tasks, notes }) {
  const now = new Date();
  const since = subDays(now, 7);
  const inWeek = (d) => d && isAfter(parseISO(d), since);
  const days = Array.from({ length: 7 }, (_, i) => subDays(now, 6 - i));
  const perDay = days.map(d => tasks.filter(t => t.completed_at && isSameDay(parseISO(t.completed_at), d)).length);
  const max = Math.max(1, ...perDay);

  const stats = [
    { v: `${tasks.filter(t => inWeek(t.created_date)).length}件`, l: "近 7 天被记住的时刻" },
    { v: `${notes.filter(n => inWeek(n.created_date)).length}枚`, l: "写下的心签" },
    { v: `${perDay.reduce((a, b) => a + b, 0)}次`, l: "兑现的约定" },
    { v: `${tasks.filter(t => t.status === "pending" && !t.parent_task_id).length}个`, l: "守护中的约定" },
  ];

  return (
    <div className="rounded-[28px] bg-white border border-slate-200/70 shadow-sm p-5 md:p-8">
      <p className="text-sm font-semibold text-slate-700">近 7 天回望 · 每一天都算数</p>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.l} className="rounded-2xl bg-slate-50 p-4">
            <div className="text-2xl font-semibold text-slate-900 tabular-nums">{s.v}</div>
            <div className="text-xs text-slate-500 mt-1">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-end gap-2 md:gap-4 h-28">
        {days.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
            <span className="text-[10px] text-slate-400 tabular-nums">{perDay[i]}</span>
            <div className={`w-full max-w-[36px] rounded-lg ${i === 6 ? "bg-[#384877]" : "bg-[#384877]/25"}`}
              style={{ height: `${Math.max(4, (perDay[i] / max) * 80)}%` }} />
            <span className="text-[11px] text-slate-500">{i === 6 ? "今" : format(d, "EEEEE", { locale: zhCN })}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400 text-center">每天兑现的约定 · 最后一柱是今天</p>
    </div>
  );
}