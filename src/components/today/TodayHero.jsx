import React from 'react';
import { PHASE_GREETING } from '@/lib/todayPhase';

/**
 * 首模块（问候 + 今日心语 + 记忆的体温 + 心栈之门入口）
 * 调性对齐产品:白色圆角卡片 + 细边框 + 品牌蓝点缀,左对齐排版;
 * 不再使用全屏渐变天幕与永动漂移动画层(首模块滑动卡顿主因)
 */
export default function TodayHero({ phase, dateLabel, whisper, memory, userName, children }) {
  return (
    <section className="sky-band reveal rounded-[28px] px-5 pb-8 pt-7 sm:px-10 sm:pt-9" style={{ '--i': 0 }}>
      <div className="relative z-10 mx-auto max-w-[720px]">
        {/* 顶行:日期 + 时段状态 */}
        <div className="flex items-center justify-between gap-3">
          <p className="num text-[11.5px] tracking-[0.18em] text-[var(--sky-sub)]">
            {dateLabel}
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sentinel)]/[0.07] px-2.5 py-1 text-[11px] font-medium text-[var(--sentinel)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sentinel)]" />
            {phase === 'night' ? '记忆值守中' : '与你同在'}
          </span>
        </div>

        {/* 问候 + 今日心语 */}
        <h1 className="mt-4 font-[var(--font-serif)] text-[26px] leading-snug text-[var(--sky-ink)] sm:text-[32px]">
          {PHASE_GREETING[phase]}，{userName}
        </h1>
        <p className="mt-2.5 max-w-[560px] font-[var(--font-serif)] text-[14px] leading-[1.9] text-[var(--sky-sub)]">
          {whisper}
        </p>

        {/* 记忆的体温:被记住的一切 */}
        <div className="num mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--hairline)] pt-4 text-[12.5px] text-[var(--sky-sub)]">
          <span>
            今日已被记住 <b className="text-[var(--sky-ink)]">{memory.kept}</b> 件
          </span>
          <i className="h-3 w-px bg-[var(--hairline-strong)]" />
          <span>
            守护中的约定 <b className="text-[var(--signal)]">{memory.watching}</b> 个
          </span>
          <i className="h-3 w-px bg-[var(--hairline-strong)]" />
          <span>
            心签 <b className="text-[var(--sky-ink)]">{memory.notes}</b> 枚
          </span>
        </div>

        {/* 心栈之门:整页唯一的记忆入口 */}
        {children}
      </div>
    </section>
  );
}
