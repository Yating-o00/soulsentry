import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notePlainText, isVaultNote, getNoteType, TYPE_META } from "./heartSignMeta";

// 晴 / 阴 关键词（与小程序手账口径一致）
const POS_RE = /(开心|高兴|治愈|感动|安心|安静|值得)/;
const NEG_RE = /(挫败|难过|焦虑|烦|累|委屈|怀疑|崩溃|孤独|失眠)/;

// 心签手账：这一周的你（近 7 天统计 + 情绪晴雨条 + 另一个你的留言）
export default function JournalDialog({ open, onOpenChange, notes }) {
  const stats = useMemo(() => {
    const pool = notes.filter((n) => !isVaultNote(n));
    const weekAgo = Date.now() - 7 * 86400000;
    const week = pool.filter((n) => new Date(n.created_date).getTime() >= weekAgo);

    const emo = week.filter((n) => getNoteType(n) === "emotion");
    const pos = emo.filter((n) => POS_RE.test(notePlainText(n))).length;
    const neg = emo.length - pos;

    const typeCount = {};
    week.forEach((n) => {
      const t = getNoteType(n);
      typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0];

    // 近 7 天每日计数（阴天标灰）
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const dayNotes = week.filter((n) => {
        const t = new Date(n.created_date).getTime();
        return t >= dayStart && t < dayEnd;
      });
      const negCnt = dayNotes.filter(
        (n) => getNoteType(n) === "emotion" && NEG_RE.test(notePlainText(n))
      ).length;
      days.push({
        key: `${d.getMonth() + 1}/${d.getDate()}`,
        cnt: dayNotes.length,
        neg: negCnt,
      });
    }

    return { total: week.length, emo: emo.length, pos, neg, topType, days };
  }, [notes]);

  const { total, emo, pos, neg, topType, days } = stats;
  const max = Math.max(1, ...days.map((d) => d.cnt));
  const topLabel = topType ? `${TYPE_META[topType[0]]?.label || "心"}签` : "—";

  const tip = neg > pos
    ? "这一周的阴天有点多。那些反复出现的事，值得被认真对待——不是因为它们可怕，而是因为你重要。要不要把它们拆小一点，转成一个小小的约定？"
    : "这一周晴多于阴。你照顾好了自己，也记住了别人。继续保持这个节奏。";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[92vw]">
        <DialogHeader>
          <DialogTitle className="text-base">这一周的你</DialogTitle>
        </DialogHeader>

        <div className="text-[10.5px] tracking-[0.18em] uppercase text-[#384877]/60 mb-3">
          Weekly · 心签手账
        </div>

        <div className="divide-y divide-slate-100 text-sm">
          <div className="flex justify-between py-2.5"><span className="text-slate-600">这一周，你留下了</span><span className="font-medium text-[#384877]">{total} 条心签</span></div>
          <div className="flex justify-between py-2.5"><span className="text-slate-600">其中情绪签</span><span className="font-medium text-[#384877]">{emo} 条（晴 {pos} · 阴 {neg}）</span></div>
          <div className="flex justify-between py-2.5"><span className="text-slate-600">最常写下的是</span><span className="font-medium text-[#384877]">{topLabel}</span></div>
        </div>

        {/* 近 7 天晴雨条 */}
        <div className="flex items-end gap-2.5 h-24 mt-5 px-1">
          {days.map((d) => (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              <div
                className={`w-full max-w-[34px] rounded-t-lg ${d.neg ? "bg-[#c9bfae]" : "bg-[#a8c5d9]"}`}
                style={{ height: `${Math.max(6, Math.round((d.cnt / max) * 72))}px` }}
                title={`${d.key} · ${d.cnt} 条`}
              />
              <span className="text-[9.5px] text-slate-400">{d.key}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 bg-[#fafbfb] border border-slate-200 rounded-xl px-4 py-3.5 text-[13px] leading-[1.9] text-slate-700">
          <b className="text-slate-800">另一个你，想说：</b>
          {tip}
        </div>
      </DialogContent>
    </Dialog>
  );
}
