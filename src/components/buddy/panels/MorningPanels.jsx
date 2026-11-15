import React, { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCheckins, useCreateCheckin } from "@/components/checkins/useCheckins";
import { BuddyMsg, PanelCard, useBuddyState, todayKey, weekDays } from "./shared";

/**
 * 打卡（早起搭子核心板块）：大打卡按钮（真实 checkin 数据）+ 本周 7 天 + 起床时刻趋势。
 * 数据来自项目约定的打卡记录——打卡时刻就是起床时刻的证据。
 */
export function MorningCheckPanel({ profile, tint, persona, projectTask }) {
  const queryClient = useQueryClient();
  const isCheckin = projectTask?.category === "checkin";
  const { data: checkinData } = useCheckins(projectTask?.id || "", { enabled: isCheckin && !!projectTask });
  const createCheckin = useCreateCheckin(projectTask?.id || "");

  const target = profile?.answers?.target || "7:00";
  const todayDone = Boolean(checkinData?.done_today);

  const greeting = {
    gentle: "早呀。今天能比昨天早 5 分钟，就是胜利。",
    strict: `目标 ${target}。起来了就打卡，别躺着刷手机。`,
    buddy: "我早就醒了（假装需要睡）。你今天几点起的？",
  };

  // 本周 7 天：有打卡记录=✓；过去的日期没记录=·；今天未到/未打卡=今
  const week = useMemo(() => {
    const items = checkinData?.items || [];
    const byDay = new Map();
    items.forEach((it) => {
      const t = new Date(it.created_date || it.createdAt);
      const key = new Date(t.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, t);
    });
    const today = todayKey();
    return weekDays().map((d) => ({
      ...d,
      state: byDay.has(d.key) ? "done" : d.key < today ? "miss" : d.key === today ? "today" : "future",
      time: byDay.get(d.key) || null,
    }));
  }, [checkinData]);

  const weekCount = week.filter((d) => d.state === "done").length;

  // 起床时刻趋势：近 7 天有记录的打卡时刻（小时制），越早柱越高
  const trend = useMemo(() => {
    return week
      .filter((d) => d.time)
      .map((d) => ({
        label: d.label,
        hour: new Date(d.time).getHours() + new Date(d.time).getMinutes() / 60,
        text: `${String(new Date(d.time).getHours()).padStart(2, "0")}:${String(new Date(d.time).getMinutes()).padStart(2, "0")}`,
      }));
  }, [week]);
  const maxH = Math.max(...trend.map((t) => t.hour), 10);
  const minH = Math.min(...trend.map((t) => t.hour), 5);

  const doCheckin = () => {
    if (todayDone || createCheckin.isPending || !projectTask) return;
    createCheckin.mutate(
      {},
      {
        onSuccess: () => {
          toast.success("打卡成功，又赢回一个早晨～");
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
        onError: (err) => toast.error(err?.message || "打卡没成功，再点一下试试"),
      }
    );
  };

  return (
    <div className="space-y-4">
      <BuddyMsg tint={tint}>{greeting[persona] || greeting.gentle}</BuddyMsg>

      {/* 大打卡按钮 */}
      <button
        onClick={doCheckin}
        disabled={todayDone || createCheckin.isPending || !isCheckin}
        aria-pressed={todayDone}
        className={`flex w-full cursor-pointer flex-col items-center rounded-3xl p-6 transition-all duration-300 active:scale-[0.98] ${
          todayDone ? "bg-[#384877] text-[#FAF9F7]" : "bg-white border border-stone-200 text-stone-900"
        }`}
      >
        <span className="text-2xl font-semibold">{todayDone ? "今天已打卡" : "起床打卡"}</span>
        <span className={`mt-1 text-sm ${todayDone ? "opacity-70" : "text-stone-400"}`}>
          {todayDone ? `本周第 ${weekCount} 天 · 连续就是胜利` : `目标 ${target} · 点一下，开启今天`}
        </span>
      </button>

      {/* 本周 7 天 */}
      <PanelCard
        title="本周"
        extra={
          <span className="text-sm text-stone-600">
            已打卡 <span className="font-semibold" style={{ color: tint[2] }}>{weekCount}</span>/7 天
          </span>
        }
      >
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {week.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-1.5">
              <span className={`text-[11px] ${d.isToday ? "font-semibold text-stone-900" : "text-stone-400"}`}>{d.label}</span>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs"
                style={{
                  background: d.state === "done" ? tint[2] : d.state === "miss" ? "#f5f5f4" : "transparent",
                  color: d.state === "done" ? "#fff" : d.state === "miss" ? "#a8a29e" : tint[2],
                  border: d.state === "today" || d.state === "future" ? `1.5px dashed ${tint[2]}` : "none",
                }}
              >
                {d.state === "done" ? "✓" : d.state === "miss" ? "·" : "今"}
              </span>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* 起床时刻趋势 */}
      {trend.length > 0 && (
        <PanelCard title="近 7 天起床时刻" extra={<span className="text-xs text-stone-400">越高越早</span>}>
          <div className="mt-3 flex h-24 items-end justify-between gap-2">
            {trend.map((t, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-stone-400">{t.text}</span>
                <div
                  className="w-full rounded-t-md transition-all duration-500"
                  style={{
                    height: 24 + ((maxH - t.hour) / (maxH - minH || 1)) * 52,
                    background: i === trend.length - 1 ? tint[2] : tint[0],
                  }}
                />
                <span className="text-[10px] text-stone-400">{t.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-stone-600">
            曲线在往对的方向走。容易破功的那两天，我会多叫一次。
          </p>
        </PanelCard>
      )}
    </div>
  );
}

/** 起床后微习惯链：按顺序做完再打卡，今日进度持久化（明天自动清零） */
export function HabitChainPanel({ chain, tint }) {
  const { state, patch } = useBuddyState("morning");
  const today = todayKey();
  const doneIdx = state.habits?.[today] || [];

  const toggle = (i) => {
    const next = doneIdx.includes(i) ? doneIdx.filter((x) => x !== i) : [...doneIdx, i];
    patch({ habits: { [today]: next } });
  };

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h2 className="text-base font-semibold text-stone-900">起床后微习惯链</h2>
        <p className="mt-1 text-[13px] text-stone-400">不靠意志力，靠「下一件事已经在等你」</p>
      </div>
      <div className="space-y-2">
        {chain.map((h, i) => {
          const done = doneIdx.includes(i);
          return (
            <button
              key={h}
              onClick={() => toggle(i)}
              aria-pressed={done}
              className={`flex min-h-[52px] w-full cursor-pointer items-center gap-3.5 rounded-2xl p-4 text-left transition-all duration-200 active:scale-[0.99] ${
                done ? "bg-white border border-stone-200" : "bg-[#FAF9F7]"
              }`}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: done ? tint[2] : tint[0], color: done ? "#fff" : tint[2] }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`flex-1 text-[15px] ${done ? "text-stone-400 line-through" : "text-stone-800"}`}>{h}</span>
              {i < chain.length - 1 && <span className="text-stone-300">→</span>}
            </button>
          );
        })}
      </div>
      <p className="rounded-2xl bg-[#FAF9F7] p-3.5 text-[13px] leading-relaxed text-stone-600">
        早起的关键在前一晚——哪天没做到，第二天我不会责怪你，只会把提醒再提前 15 分钟。
      </p>
    </div>
  );
}
