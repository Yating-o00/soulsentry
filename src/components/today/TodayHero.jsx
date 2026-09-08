import React from 'react';
import { PHASE_GREETING } from '@/lib/todayPhase';

/**
 * Hero 天幕带：时段问候 + 日期 + 今日心语 + 记忆的体温 chip
 * 视觉移植自参考稿 sections/HeroGate.tsx 的问候区
 */
export default function TodayHero({ phase, dateLabel, whisper, memory, userName, children }) {
  return (
    <section className="sky-band reveal rounded-[28px] px-6 pb-12 pt-12 sm:px-12" style={{ '--i': 0 }}>
      <div className="relative z-10 mx-auto max-w-[760px] text-center">
        <p className="num text-[12px] tracking-[0.22em] text-[var(--sky-sub)]">
          {dateLabel} · {phase === 'night' ? '记忆值守中' : '与你同在'}
        </p>
        <h1 className="mt-4 font-[var(--font-serif)] text-[30px] leading-tight text-[var(--sky-ink)] sm:text-[40px]">
          {PHASE_GREETING[phase]}，{userName}
        </h1>
        <p className="mx-auto mt-4 max-w-[560px] font-[var(--font-serif)] text-[15px] leading-[2] text-[var(--sky-sub)]">
          {whisper}
        </p>

        {/* 记忆的体温：不是待办与完成率，而是被记住的一切
            不用 backdrop-filter：滚动时 behind 重绘代价高，纯色半透明替代 */}
        <div className="sky-chip num mt-5 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-full border border-[var(--hairline)] bg-white/60 px-5 py-2 text-[12.5px] text-[var(--sky-sub)]">
          <span>
            今日已被记住 <b className="text-[var(--sky-ink)]">{memory.kept}</b> 件
          </span>
          <i className="hidden h-3 w-px bg-[var(--hairline-strong)] sm:block" />
          <span>
            守护中的约定 <b className="text-[var(--signal)]">{memory.watching}</b> 个
          </span>
          <i className="hidden h-3 w-px bg-[var(--hairline-strong)] sm:block" />
          <span>
            心签 <b className="text-[var(--sky-ink)]">{memory.notes}</b> 枚
          </span>
        </div>

        {/* 内容输入:心栈之门直接坐在天幕带里,作为整页唯一的记忆入口 */}
        {children}
      </div>
    </section>
  );
}
