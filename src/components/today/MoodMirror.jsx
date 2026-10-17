import React from 'react';
import { parseISO, subDays, isAfter, getHours } from 'date-fns';

// 简单中文停用词：分词统计时剔除
const STOPWORDS = new Set([
  '我们', '他们', '自己', '今天', '现在', '已经', '正在', '觉得', '知道', '时候',
  '可以', '什么', '怎么', '这么', '没有', '不是', '还是', '因为', '所以', '但是',
  '如果', '一个', '一样', '真的', '其实', '可能', '应该', '只是', '还有', '就是',
  '这样', '那样', '不要', '不能', '不会', '需要', '希望', '感觉', '有点', '一切',
]);

function extractKeywords(text) {
  const cleaned = (text || '').replace(/[\s，。！？；：、「」『』（）()【】\[\]{}\-_—*#@~`^|\\/.,;:!?'"<>]+/g, '');
  const freq = {};
  // 2-4 字滑窗，统计词频
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i + len <= cleaned.length; i++) {
      const w = cleaned.slice(i, i + len);
      if (/^[\u4e00-\u9fa5]+$/.test(w) && !STOPWORDS.has(w) && !STOPWORDS.has(w.slice(0, 2))) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
  }
  return freq;
}

/**
 * 心境：心签 + 约定的数据分析（本地规则，不新增 AI 调用）
 * 视觉移植自参考稿 sections/Mirror.tsx
 */
export default function MoodMirror({ notes, tasks }) {
  const observations = React.useMemo(() => {
    const now = new Date();
    const monthAgo = subDays(now, 30);
    const recentNotes = (Array.isArray(notes) ? notes : []).filter(
      (n) => n && !n.deleted_at && (!n.created_date || isAfter(parseISO(n.created_date), monthAgo))
    );
    const allTasks = Array.isArray(tasks) ? tasks.filter((t) => t && !t.deleted_at) : [];
    const result = [];

    // 1. 心签关键词
    const freq = {};
    recentNotes.forEach((n) => {
      const tags = Array.isArray(n.tags) ? n.tags.join(' ') : '';
      const f = extractKeywords(`${n.title || ''} ${n.content || ''} ${tags}`);
      Object.entries(f).forEach(([w, c]) => {
        freq[w] = (freq[w] || 0) + c;
      });
    });
    const top = Object.entries(freq)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (top.length > 0) {
      result.push({
        count: `${recentNotes.length} 枚`,
        key: `「${top.map(([w]) => w).join('」「')}」`,
        text: '近 30 天，它们一再出现在你的心签里——这些词背后，是你最近最真实的心事。',
      });
    } else if (recentNotes.length > 0) {
      result.push({
        count: `${recentNotes.length} 枚`,
        key: '近 30 天的心签',
        text: '你一直在记录。再多写一些，我会帮你认出那些反复出现的牵挂与向往。',
      });
    }

    // 2. 完成趋势
    const completions = allTasks.filter((t) => t.status === 'completed' && t.completed_at);
    const recent3 = completions.filter((t) => isAfter(parseISO(t.completed_at), subDays(now, 3))).length;
    const prev4 = completions.filter((t) => {
      const d = parseISO(t.completed_at);
      return isAfter(d, subDays(now, 7)) && !isAfter(d, subDays(now, 3));
    }).length;
    if (completions.length > 0) {
      const trend =
        recent3 > prev4 ? '正在上升' : recent3 < prev4 ? '稍缓了一些' : '保持得平稳';
      result.push({
        count: `${completions.length} 次`,
        key: '兑现的约定',
        text: `近 3 天完成 ${recent3} 件，此前 4 天完成 ${prev4} 件——节奏${trend}。不必赶，按你的步子来。`,
      });
    }

    // 3. 深夜灵感
    const nightNotes = recentNotes.filter((n) => {
      if (!n.created_date) return false;
      const h = getHours(parseISO(n.created_date));
      return h >= 23 || h < 5;
    }).length;
    if (nightNotes > 0) {
      result.push({
        count: `${nightNotes} 枚`,
        key: '深夜写下的心签',
        text: '安静时的你，最接近你自己——记得也给那个你，留一些睡眠。',
      });
    }

    return result.slice(0, 3);
  }, [notes, tasks]);

  const latestNote = React.useMemo(() => {
    const list = (Array.isArray(notes) ? notes : []).filter((n) => n && !n.deleted_at && n.title);
    return list[0] || null;
  }, [notes]);

  return (
    <div className="hairline-card rounded-2xl px-6 py-6 sm:px-8">
      <p className="font-[var(--font-serif)] text-[16px] leading-relaxed text-[var(--ink)]">
        你从不需要成为「第一」，
        <br />
        你只需要慢慢看清——你是谁。
      </p>

      {observations.length > 0 ? (
        <div className="mt-5 divide-y divide-[var(--hairline)]">
          {observations.map((o) => (
            <div key={o.key} className="flex gap-4 py-4 first:pt-0 last:pb-0">
              <span className="num w-[62px] shrink-0 pt-0.5 text-[13px] font-medium text-[var(--signal)]">
                {o.count}
              </span>
              <p className="text-[13.5px] leading-[1.9] text-[var(--ink-2)]">
                <b className="font-medium text-[var(--ink)]">{o.key}</b>
                {'　'}
                {o.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-[13px] leading-[1.9] text-[var(--ink-3)]">
          记忆还不多。从写下第一枚心签、定下第一个约定开始，我会在这里慢慢拼出你。
        </p>
      )}

      {latestNote && (
        <p className="mt-5 border-t border-[var(--hairline)] pt-4 font-[var(--font-serif)] text-[13px] text-[var(--ink-3)]">
          最近一枚心签：「{latestNote.title.slice(0, 24)}{latestNote.title.length > 24 ? '…' : ''}」
        </p>
      )}
    </div>
  );
}
