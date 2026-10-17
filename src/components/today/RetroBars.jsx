import React from 'react';
import { parseISO, subDays, startOfDay, isSameDay, getDay } from 'date-fns';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 回望：近 7 天被记住的时刻（柱状图）+ 本周统计
 * 视觉移植自参考稿 sections/StatsRetro.tsx 数据统计卡，数据接真实 Task/Note
 */
export default function RetroBars({ tasks, notes }) {
  const data = React.useMemo(() => {
    const allTasks = Array.isArray(tasks) ? tasks.filter((t) => t && !t.deleted_at) : [];
    const allNotes = Array.isArray(notes) ? notes.filter((n) => n && !n.deleted_at) : [];
    const now = new Date();

    // 近 7 天（含今天）每日完成的约定数
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(startOfDay(now), i);
      const count = allTasks.filter(
        (t) => t.status === 'completed' && t.completed_at && isSameDay(parseISO(t.completed_at), d)
      ).length;
      days.push({ date: d, count });
    }
    const max = Math.max(1, ...days.map((d) => d.count));

    const weekStart = subDays(now, 7);
    const inWeek = (dateStr) => dateStr && parseISO(dateStr) >= weekStart;
    const completedWeek = allTasks.filter(
      (t) => t.status === 'completed' && t.completed_at && inWeek(t.completed_at)
    ).length;
    const notesWeek = allNotes.filter((n) => inWeek(n.created_date)).length;
    const keptWeek = allTasks.filter((t) => inWeek(t.created_date)).length + notesWeek;

    return {
      days,
      max,
      stats: [
        { num: keptWeek, unit: '件', label: '近 7 天被记住的时刻' },
        { num: notesWeek, unit: '枚', label: '写下的心签' },
        { num: completedWeek, unit: '次', label: '兑现的约定' },
        { num: allTasks.filter((t) => t.status === 'pending').length, unit: '个', label: '守护中的约定' },
      ],
    };
  }, [tasks, notes]);

  return (
    <div className="hairline-card h-full rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--sentinel)] px-4 py-1.5 text-[12.5px] font-medium text-white shadow-[0_4px_12px_-4px_rgba(34,62,134,0.5)]">
          近 7 天
        </span>
        <span className="num ml-auto shrink-0 whitespace-nowrap text-[11px] tracking-wide text-[var(--ink-4)]">
          回望 · 每一天都算数
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6">
        {data.stats.map((s) => (
          <div key={s.label}>
            <p className="num text-[24px] leading-none text-[var(--ink)]">
              {s.num}
              <span className="ml-0.5 text-[12px] text-[var(--ink-3)]">{s.unit}</span>
            </p>
            <p className="mt-1.5 text-[11.5px] text-[var(--ink-3)]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 极小柱状图 */}
      <div className="mt-7 border-t border-[var(--hairline)] pt-5">
        <div className="flex h-[72px] items-end gap-[10px]">
          {data.days.map((d, i) => (
            <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
              <span className="num text-[9.5px] text-[var(--ink-4)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {d.count}
              </span>
              <div
                className={`w-full rounded-t-[4px] ${i === data.days.length - 1 ? 'bar-today' : 'bar-col'}`}
                style={{ height: `${(d.count / data.max) * 52}px`, transitionDelay: `${i * 60}ms` }}
              />
              <span className="text-[10px] text-[var(--ink-4)]">
                {i === data.days.length - 1 ? '今' : WEEK_LABELS[getDay(d.date)]}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[10.5px] text-[var(--ink-4)]">每天兑现的约定 · 最后一柱是今天</p>
      </div>
    </div>
  );
}
