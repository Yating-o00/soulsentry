import React from 'react';
import { format, parseISO, subDays, startOfDay, endOfDay, isWithinInterval, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MAX_OFFSET = 7; // 最多回溯 7 天

function timeOf(iso) {
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '';
  }
}

/**
 * 今日印记：当日约定的时间线 + 往日追溯
 * 视觉移植自参考稿 sections/Timeline.tsx，数据接真实 Task / Note
 */
export default function TodayTimeline({ tasks, notes, nowLabel, onToggle }) {
  const [offset, setOffset] = React.useState(0); // 0 = 今天

  const allTasks = React.useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks]);
  const allNotes = React.useMemo(
    () => (Array.isArray(notes) ? notes.filter((n) => n && !n.deleted_at) : []),
    [notes]
  );

  // 某一天的印记：当日提醒的约定 + 当日完成的约定 + 当日写下的心签
  const itemsForDay = React.useMemo(() => {
    return (dayOffset) => {
      const day = startOfDay(subDays(new Date(), dayOffset));
      const inDay = (iso) => {
        if (!iso) return false;
        try {
          return isWithinInterval(parseISO(iso), { start: startOfDay(day), end: endOfDay(day) });
        } catch {
          return false;
        }
      };

      const items = [];
      for (const t of allTasks) {
        const happened = inDay(t.reminder_time) || inDay(t.completed_at);
        if (!happened) continue;
        const doneOnDay = t.completed_at && isSameDay(parseISO(t.completed_at), day);
        const timeLabel = inDay(t.reminder_time) ? timeOf(t.reminder_time) : doneOnDay ? timeOf(t.completed_at) : '';
        items.push({
          key: t.id,
          time: timeLabel,
          title: t.title,
          tag: t.category ? `约定 · ${t.category}` : '约定',
          done: doneOnDay || t.status === 'completed',
        });
      }
      for (const n of allNotes) {
        if (!inDay(n.created_date)) continue;
        items.push({
          key: `n-${n.id}`,
          time: timeOf(n.created_date),
          title: n.title || '心签',
          tag: '心签',
          done: true,
          isNote: true,
        });
      }
      return items.sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
    };
  }, [allTasks, allNotes]);

  // 今天：可交互（待完成置顶，已完成的按完成时间倒序排在最后）
  const todayItems = React.useMemo(() => {
    const pending = [];
    const done = [];
    for (const t of allTasks) {
      const inToday =
        (t.reminder_time && isSameDay(parseISO(t.reminder_time), new Date())) ||
        (t.completed_at && isSameDay(parseISO(t.completed_at), new Date()));
      if (!inToday) continue;
      const isDone = t.status === 'completed';
      (isDone ? done : pending).push(t);
    }
    pending.sort((a, b) => new Date(a.reminder_time || 0) - new Date(b.reminder_time || 0));
    done.sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
    return [...pending, ...done];
  }, [allTasks]);

  const nextIdx = todayItems.findIndex((a) => a.status !== 'completed');
  const isToday = offset === 0;
  const dayItems = isToday ? [] : itemsForDay(offset);
  const dayDate = subDays(new Date(), offset);
  const dayLabel = format(dayDate, 'M月d日 EEEE', { locale: zhCN });

  const pill = (value, label) => (
    <button
      onClick={() => setOffset(value)}
      className={`rounded-full px-4 py-1.5 text-[12.5px] transition-all duration-300 ${
        offset === value
          ? 'bg-[var(--sentinel)] font-medium text-white shadow-[0_4px_12px_-4px_rgba(56,72,119,0.5)]'
          : 'border border-[var(--hairline)] bg-white/60 text-[var(--ink-2)] hover:border-[var(--sentinel)]/40'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* 追溯：回望经过的每一天 */}
      <div className="flex flex-wrap items-center gap-2">
        {pill(0, '今天')}
        {pill(1, '昨天')}
        {pill(2, '前天')}
        <button
          onClick={() => setOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          disabled={offset >= MAX_OFFSET}
          aria-label="往前一天"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--hairline)] bg-white/60 text-[var(--ink-3)] transition-all duration-300 hover:border-[var(--sentinel)]/40 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset <= 0}
          aria-label="往后一天"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--hairline)] bg-white/60 text-[var(--ink-3)] transition-all duration-300 hover:border-[var(--sentinel)]/40 disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {!isToday && (
          <span className="num ml-1 text-[11.5px] text-[var(--ink-3)]">{dayLabel} · 已定格的记忆</span>
        )}
        {isToday && <span className="ml-1 text-[11.5px] text-[var(--ink-3)]">⟲ 追溯每一天</span>}
      </div>

      <div className="mt-6" key={offset}>
        {!isToday ? (
          /* —— 往日印记 —— */
          dayItems.length > 0 ? (
            <div className="echo-born">
              {dayItems.map((a, i) => (
                <div key={a.key} className="relative flex gap-5 pb-6">
                  {i < dayItems.length - 1 && (
                    <span className="absolute left-[52px] top-7 h-[calc(100%-18px)] w-px bg-[var(--hairline)]" />
                  )}
                  <div className="num w-[38px] shrink-0 pt-1 text-right text-[13px] text-[var(--ink-4)]">
                    {a.time || '—'}
                  </div>
                  <span className="relative z-10 mt-[5px] h-[10px] w-[10px] shrink-0 rounded-full bg-[var(--jade)]/70" />
                  <div className="min-w-0 flex-1 pt-0">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-[14px] text-[var(--ink-2)]">{a.title}</span>
                      <span className="rounded bg-black/[0.035] px-1.5 py-0.5 text-[10.5px] text-[var(--ink-4)]">
                        {a.tag}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <p className="pl-[63px] font-[var(--font-serif)] text-[12.5px] text-[var(--ink-3)]">
                —— 这一天，已被完整收进你的记忆
              </p>
            </div>
          ) : (
            <div className="hairline-card rounded-2xl px-6 py-8 text-center">
              <p className="font-[var(--font-serif)] text-[14px] text-[var(--ink-3)]">
                {dayLabel}，没有留下印记。
              </p>
            </div>
          )
        ) : todayItems.length === 0 ? (
          /* —— 今天：空态 —— */
          <div className="hairline-card rounded-2xl px-6 py-10 text-center">
            <p className="font-[var(--font-serif)] text-[15px] text-[var(--ink-3)]">
              今天还没有约定。上方的门，随时为你开。
            </p>
          </div>
        ) : (
          /* —— 今日印记（正在经过） —— */
          <div>
            {todayItems.map((a, i) => {
              const isNext = i === nextIdx;
              const timeLabel = a.reminder_time ? timeOf(a.reminder_time) : '待定';
              const tag = a.category ? `约定 · ${a.category}` : '约定';
              return (
                <div key={a.id} className="relative flex gap-5 pb-7">
                  {i < todayItems.length - 1 && (
                    <span className="absolute left-[52px] top-8 h-[calc(100%-20px)] w-px bg-[var(--hairline-strong)]" />
                  )}

                  <div className="num w-[38px] shrink-0 pt-1 text-right text-[13px] text-[var(--ink-3)]">
                    {timeLabel}
                  </div>

                  <button
                    onClick={() => onToggle(a)}
                    aria-label={a.status === 'completed' ? '恢复这条约定' : '标记已赴约'}
                    className={`relative z-10 mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-300 ${
                      a.status === 'completed'
                        ? 'check-pop border-[var(--jade)] bg-[var(--jade)] text-white'
                        : isNext
                          ? 'pulse-dot border-[var(--signal)] bg-[var(--signal)]'
                          : 'border-[var(--ink-4)] bg-white hover:border-[var(--ink-2)]'
                    }`}
                  >
                    {a.status === 'completed' && <span className="text-[10px]">✓</span>}
                  </button>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span
                        className={`text-[15px] ${
                          a.status === 'completed' ? 'text-[var(--ink-4)]' : 'font-medium text-[var(--ink)]'
                        }`}
                      >
                        {a.title}
                      </span>
                      <span className="rounded bg-black/[0.045] px-1.5 py-0.5 text-[10.5px] text-[var(--ink-3)]">
                        {tag}
                      </span>
                      {isNext && (
                        <span className="rounded bg-[var(--signal-soft)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--signal)]">
                          将至
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                      {a.status === 'completed'
                        ? '已赴约 · 这一刻已被收进你的记忆'
                        : isNext
                          ? `心栈记得 · ${timeLabel}，我会在`
                          : '我记得 · 到点会轻轻唤你'}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* NOW 游标 */}
            <div className="flex items-center gap-4 pb-2 pl-[38px]">
              <span className="now-thread h-[2px] flex-1 rounded-full" />
              <span className="num text-[11px] tracking-[0.18em] text-[var(--signal)]">此刻 {nowLabel}</span>
              <span className="now-thread h-[2px] w-10 rounded-full [transform:scaleX(-1)]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
