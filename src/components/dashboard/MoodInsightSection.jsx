import React from "react";
import { subDays, parseISO, isAfter } from "date-fns";

/** 心境：从心签与约定中提炼近期的你 */
export default function MoodInsightSection({ notes, tasks }) {
  const now = new Date();
  const recentNotes = notes.filter(n => n.created_date && isAfter(parseISO(n.created_date), subDays(now, 30)));
  const tagCount = {};
  recentNotes.forEach(n => (n.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

  const doneIn = (from, to) => tasks.filter(t => t.completed_at && isAfter(parseISO(t.completed_at), subDays(now, from)) && !isAfter(parseISO(t.completed_at), subDays(now, to))).length;
  const recent3 = doneIn(3, 0);
  const prev4 = doneIn(7, 3);
  const lateNotes = recentNotes.filter(n => { const h = parseISO(n.created_date).getHours(); return h >= 23 || h < 5; });
  const latest = notes[0]?.plain_text || notes[0]?.content?.replace(/<[^>]+>/g, "");

  const items = [
    { num: `${recentNotes.length} 枚`, title: topTags.length ? topTags.map(t => `「${t}」`).join("") : "近 30 天的心签",
      text: topTags.length ? "近 30 天，它们一再出现在你的心签里——这些词背后，是你最近最真实的心事。" : "还没有反复出现的关键词，慢慢写，心事会自己浮现。" },
    { num: `${recent3 + prev4} 次`, title: "兑现的约定",
      text: `近 3 天完成 ${recent3} 件，此前 4 天完成 ${prev4} 件——${recent3 >= prev4 ? "节奏保持得平稳。" : "最近慢了一些。"}不必赶，按你的步子来。` },
    { num: `${lateNotes.length} 枚`, title: "深夜写下的心签",
      text: lateNotes.length ? "安静时的你，最接近你自己——记得也给那个你，留一些睡眠。" : "你很少在深夜写下心事，作息很温柔。" },
  ];

  return (
    <div className="rounded-[28px] bg-gradient-to-br from-[#F7F4EF] to-white border border-[#EAE5DD] p-6 md:p-10">
      <p className="text-lg md:text-2xl font-semibold text-slate-800 leading-snug">你从不需要成为「第一」，</p>
      <p className="text-lg md:text-2xl font-semibold text-slate-500 leading-snug">你只需要慢慢看清——你是谁。</p>
      <div className="mt-6 grid md:grid-cols-3 gap-3">
        {items.map(it => (
          <div key={it.title} className="rounded-2xl bg-white/80 border border-[#EAE5DD] p-4">
            <div className="text-2xl font-semibold text-[#384877] tabular-nums">{it.num}</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 truncate">{it.title}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{it.text}</p>
          </div>
        ))}
      </div>
      {latest && <p className="mt-5 text-xs text-slate-400 truncate">最近一枚心签：「{latest.slice(0, 40)}」</p>}
    </div>
  );
}