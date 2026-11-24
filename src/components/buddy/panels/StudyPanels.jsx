import React, { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCheckins, useCreateCheckin } from "@/components/checkins/useCheckins";
import { useBuddyState, todayKey } from "./shared";
import BuddyChatPanel from "./BuddyChatPanel";

function weekStamp() {
  const now = new Date(Date.now() + 8 * 3600000);
  const dow = (now.getUTCDay() + 6) % 7;
  return todayKey(-dow);
}

function StudyArtifact({
  planTitle,
  planLines,
  week,
  doneCount,
  streak,
  total,
  report,
  todayDone,
  canCheckin,
  pending,
  tint,
  onCheckin,
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] tracking-widest text-stone-400">学习进度</span>
        <span className="text-[10px] text-stone-400">{canCheckin ? "打卡约定" : "边聊边记"}</span>
      </div>

      <div className="mt-2 max-h-[min(250px,30dvh)] space-y-2 overflow-y-auto pr-1">
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: `linear-gradient(135deg, ${tint[0]} 0%, #ffffff 78%)` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[16px] font-semibold text-stone-900">{planTitle || "今日学习"}</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
                {todayDone
                  ? "今天已经打过卡，剩下的时间按自己的节奏来。"
                  : canCheckin
                    ? "今天还没有打卡，先完成最小的一步。"
                    : "把今天学到的内容说给搭子听，会自动记下来。"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[9px] text-stone-500">
              {todayDone ? "已打卡" : "待打卡"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-stone-500">
            <span className="inline-flex items-center gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" /> 本周 {doneCount}/7 天
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Flame className="h-2.5 w-2.5" /> 连续 {streak} 天
            </span>
            <span>累计 {total} 次</span>
          </div>
        </div>

        <div className="rounded-xl border border-stone-100 bg-[#FAF9F7] p-2.5">
          <div className="flex items-center justify-between text-[10px] text-stone-500">
            <span>本周 7 天</span>
            <span>{doneCount}/7</span>
          </div>
          <div className="mt-2 flex h-16 items-end gap-1.5">
            {week.map((day, index) => (
              <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center">
                <div
                  className="w-full rounded-t-md transition-all duration-500"
                  style={{
                    height: day.done ? 40 : 10,
                    background: day.done ? tint[2] : "#e7e5e4",
                    opacity: index === week.length - 1 ? 1 : 0.78,
                  }}
                />
                <div className="mt-1 text-[8px] text-stone-400">{day.label}</div>
              </div>
            ))}
          </div>
        </div>

        {planLines.length > 0 && (
          <div className="rounded-xl border border-stone-100 bg-[#FAF9F7] px-2.5 py-2">
            <div className="text-[9px] tracking-widest text-stone-400">当前推进</div>
            <div className="mt-1 space-y-0.5">
              {planLines.slice(0, 3).map((line) => (
                <p key={line} className="text-[10px] leading-relaxed text-stone-600">
                  · {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {report?.summary && (
          <div className="rounded-xl px-2.5 py-2 text-[10px] leading-relaxed" style={{ background: tint[0], color: tint[2] }}>
            <div className="mb-1 flex items-center gap-1 text-[9px] font-medium">
              <Sparkles className="h-3 w-3" /> 本周小结
            </div>
            <p className="line-clamp-3">{report.summary}</p>
            {report.next_week?.length > 0 && (
              <p className="mt-1 line-clamp-2 opacity-80">下周：{report.next_week.slice(0, 2).join("；")}</p>
            )}
          </div>
        )}
      </div>

      {canCheckin && (
        <button
          type="button"
          onClick={onCheckin}
          disabled={todayDone || pending}
          className="mt-2 w-full rounded-full px-3 py-2 text-[11px] font-medium text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          style={{ background: tint[2] }}
        >
          {todayDone ? "今天已打卡，明天继续" : pending ? "正在打卡…" : "今天完成任务，打卡"}
        </button>
      )}
      <p className="mt-1.5 text-[9px] leading-relaxed text-stone-400">
        说一句「今天学了什么」或上传笔记，会自动记进学习记录。
      </p>
    </div>
  );
}

/**
 * 学习搭子第一栏：聊天 + 聊天内的学习进度卡。
 * 打卡/周进度/本周小结都在卡里；学习内容通过聊天自动记录，只保留一个输入口。
 */
export function StudyChatPanel({ buddy, profile, tint, projectTask = null }) {
  const queryClient = useQueryClient();
  const { state } = useBuddyState("study");
  const isCheckin = projectTask?.category === "checkin";
  const { data: checkinData } = useCheckins(projectTask?.id || "", { enabled: isCheckin && !!projectTask });
  const createCheckin = useCreateCheckin(projectTask?.id || "");
  const todayDone = Boolean(checkinData?.done_today);

  const week = useMemo(() => {
    const items = checkinData?.items || [];
    const byDay = new Set(
      items
        .map((item) => {
          const raw = item.created_at || item.created_date || item.createdAt;
          const time = new Date(raw);
          if (!raw || Number.isNaN(time.getTime())) return null;
          return new Date(time.getTime() + 8 * 3600000).toISOString().slice(0, 10);
        })
        .filter(Boolean)
    );
    // 打卡刚成功、items 还没刷回来时，先用 done_today 把今天标上，避免进度和按钮打架
    if (checkinData?.done_today) byDay.add(todayKey());
    return Array.from({ length: 7 }, (_, index) => {
      const key = todayKey(-(6 - index));
      return {
        key,
        done: byDay.has(key),
        label: ["日", "一", "二", "三", "四", "五", "六"][new Date(`${key}T00:00:00Z`).getUTCDay()],
      };
    });
  }, [checkinData]);

  const doneCount = week.filter((day) => day.done).length;
  const streak = useMemo(() => {
    let count = 0;
    for (let index = 0; index < 7; index += 1) {
      if (index === 0 && !week[6]?.done) continue;
      if (week[6 - index]?.done) count += 1;
      else break;
    }
    return count;
  }, [week]);
  const report = state.weekly?.week_stamp === weekStamp() ? state.weekly : null;

  const doCheckin = () => {
    if (todayDone || createCheckin.isPending || !projectTask) return;
    createCheckin.mutate(
      {},
      {
        onSuccess: () => {
          toast.success("打卡成功，今天也往前挪了一点");
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
        onError: (error) => toast.error(error?.message || "打卡没成功，再点一下试试"),
      }
    );
  };

  return (
    <BuddyChatPanel
      buddy={buddy}
      profile={profile}
      tint={tint}
      projectTask={projectTask}
      artifacts={
        <StudyArtifact
          planTitle={profile?.plan_title || projectTask?.title || ""}
          planLines={Array.isArray(profile?.plan_lines) ? profile.plan_lines : []}
          week={week}
          doneCount={doneCount}
          streak={streak}
          total={checkinData?.total ?? 0}
          report={report}
          todayDone={todayDone}
          canCheckin={isCheckin}
          pending={createCheckin.isPending}
          tint={tint}
          onCheckin={doCheckin}
        />
      }
    />
  );
}
