import React from 'react';
import { format, parseISO } from 'date-fns';

/**
 * 今日印记：当日约定的时间线
 * 视觉移植自参考稿 sections/Timeline.tsx「今日」分支，数据接真实 Task
 */
export default function TodayTimeline({ tasks, nowLabel, onToggle }) {
  // 排序：未完成的按提醒时间在前，已完成的按完成时间排在最后
  const items = React.useMemo(() => {
    const pending = tasks
      .filter((t) => t.status !== 'completed')
      .slice()
      .sort((a, b) => new Date(a.reminder_time || 0) - new Date(b.reminder_time || 0));
    const done = tasks
      .filter((t) => t.status === 'completed')
      .slice()
      .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
    return [...pending, ...done];
  }, [tasks]);

  const nextIdx = items.findIndex((a) => a.status !== 'completed');

  if (items.length === 0) {
    return (
      <div className="hairline-card rounded-2xl px-6 py-10 text-center">
        <p className="font-[var(--font-serif)] text-[15px] text-[var(--ink-3)]">
          今天还没有约定。上方的门，随时为你开。
        </p>
      </div>
    );
  }

  return (
    <div>
      {items.map((a, i) => {
        const isNext = i === nextIdx;
        const timeLabel = a.reminder_time
          ? format(parseISO(a.reminder_time), 'HH:mm')
          : '待定';
        const tag = a.category ? `约定 · ${a.category}` : '约定';
        return (
          <div key={a.id} className="relative flex gap-5 pb-7">
            {i < items.length - 1 && (
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
  );
}
