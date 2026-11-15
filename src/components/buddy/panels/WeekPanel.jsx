import React, { useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCheckins } from "@/components/checkins/useCheckins";
import { PanelCard, TintButton, useBuddyAgent, useBuddyState, todayKey } from "./shared";

/**
 * 周报（学习搭子）：真实数据驱动——项目约定打卡记录算 7 日赴约曲线，
 * LLM（weekly 模式）把数据写成有温度的小结 + 下周弹性计划。结果缓存进板块状态，一周内可手动重生成。
 */
export default function WeekPanel({ tint, projectTask }) {
  const { call } = useBuddyAgent("study");
  const { state, patch } = useBuddyState("study");
  const [generating, setGenerating] = useState(false);

  const isCheckin = projectTask?.category === "checkin";
  const { data: checkinData } = useCheckins(projectTask?.id || "", { enabled: isCheckin && !!projectTask });

  // 近 7 天赴约情况（0/1）与连续天数
  const days = useMemo(() => {
    const items = checkinData?.items || [];
    const byDay = new Set(
      items.map((it) => new Date(new Date(it.created_date || it.createdAt).getTime() + 8 * 3600000).toISOString().slice(0, 10))
    );
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const key = todayKey(-i);
      arr.push({ key, done: byDay.has(key), label: ["日", "一", "二", "三", "四", "五", "六"][new Date(key + "T00:00:00Z").getUTCDay()] });
    }
    return arr;
  }, [checkinData]);

  const doneCount = days.filter((d) => d.done).length;
  const streak = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      if (todayKey(-i) === todayKey() && !days[6]?.done) continue; // 今天还没打卡不断 streak
      if (days[6 - i]?.done) n++;
      else break;
    }
    return n;
  }, [days]);

  const report = state.weekly?.week_stamp === weekStamp() ? state.weekly : null;

  function weekStamp() {
    // 本周一的日期作为一周标识
    const now = new Date(Date.now() + 8 * 3600000);
    const dow = (now.getUTCDay() + 6) % 7;
    return todayKey(-dow);
  }

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const stats = `本周（7天）打卡 ${doneCount} 天，当前连续 ${streak} 天，累计打卡 ${checkinData?.total ?? 0} 次；本周每日赴约：${days.map((d) => `周${d.label}${d.done ? "✓" : "×"}`).join("、")}`;
      const data = await call({ mode: "weekly", payload: { stats } });
      patch({ weekly: { week_stamp: weekStamp(), done_count: doneCount, ...data } });
    } catch (e) {
      toast.error(e?.message || "搭子走神了，再试一次");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 7 日赴约曲线（真实数据） */}
      <PanelCard
        title="本周赴约 · 7 日"
        extra={
          <span className="font-display text-2xl font-semibold" style={{ color: tint[2] }}>
            {doneCount}<span className="text-sm">/7 天</span>
          </span>
        }
      >
        <div className="mt-3 flex h-24 items-end justify-between gap-2">
          {days.map((d, i) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{ height: d.done ? 72 : 16, background: d.done ? tint[2] : "#e7e5e4", opacity: i === 6 ? 1 : 0.75 }}
              />
              <span className="text-[10px] text-stone-400">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-stone-400">
          <span>当前连续 {streak} 天</span>
          <span>累计 {checkinData?.total ?? 0} 次</span>
        </div>
      </PanelCard>

      {/* 心栈小结（LLM，缓存一周） */}
      {report ? (
        <>
          <PanelCard dark>
            <div className="flex items-center gap-2 text-xs tracking-widest opacity-70">心栈小结</div>
            <p className="mt-2.5 text-[15px] leading-relaxed">{report.summary}</p>
          </PanelCard>
          <div className="grid grid-cols-2 gap-3">
            <PanelCard>
              <div className="text-xs text-stone-400">最强项</div>
              <div className="mt-1 text-lg text-stone-900">{report.strongest}</div>
            </PanelCard>
            <PanelCard>
              <div className="text-xs text-stone-400">要关注</div>
              <div className="mt-1 text-lg text-stone-900">{report.weakest}</div>
            </PanelCard>
          </div>
          <PanelCard title="下周弹性计划（按本周表现微调）">
            <ul className="mt-2.5 space-y-2">
              {(report.next_week || []).map((n) => (
                <li key={n} className="flex items-start gap-2 text-[15px] text-stone-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint[2] }} />
                  {n}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5">
              <p className="text-xs text-stone-400">计划保留 20% 缓冲，完不成会降级而不是怪你。</p>
              <button onClick={generate} disabled={generating} className="text-xs text-stone-400 hover:text-stone-600 inline-flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} /> 重新生成
              </button>
            </div>
          </PanelCard>
        </>
      ) : (
        <PanelCard>
          <div className="py-4 text-center">
            <p className="text-sm text-stone-500">每周日晚，搭子和你一起看这一周。</p>
            <TintButton tint={tint} onClick={generate} disabled={generating || !projectTask} className="mt-4 w-full">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "生成本周复盘"}
            </TintButton>
          </div>
        </PanelCard>
      )}
    </div>
  );
}
