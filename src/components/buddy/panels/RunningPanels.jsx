import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  Footprints,
  Loader2,
  Medal,
  Moon,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import { BuddyMsg, PanelCard, TintButton, useBuddyAgent, useBuddyState, todayKey } from "./shared";
import {
  RUNNING_KNOWLEDGE,
  activeInjuries,
  addDays,
  bodyTrend,
  buildRunnerProfile,
  computeAchievements,
  computeConsistency,
  computeRunningStats,
  diffDays,
  formatDuration,
  formatPace,
  getAbilityProfile,
  getRunningStatus,
  lastWeekSummary,
  latestBody,
  nextGoalFor,
  todayKeyBJ,
  weekdayLabel,
  weeklyKmSeries,
} from "@/lib/running";

const SESSION_COLOR = {
  easy: "bg-[#eef2ff] text-[#384877]",
  walk_run: "bg-[#eef2ff] text-[#384877]",
  interval: "bg-[#fdf2e9] text-[#9a5b2d]",
  tempo: "bg-[#f5efe6] text-[#7a5a36]",
  long: "bg-[#e8f1ee] text-[#35645a]",
  strength: "bg-[#f1eef7] text-[#5b4a76]",
  rest: "bg-stone-100 text-stone-400",
};

function shortDate(key) {
  if (!key) return "";
  const parts = String(key).split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : key;
}

function logPace(log) {
  const km = Number(log?.distance_km) || 0;
  const min = Number(log?.duration_min) || 0;
  if (!km || !min) return "—";
  return formatPace((min * 60) / km);
}

function runnerGreeting(persona, session) {
  if (session.type === "rest") {
    if (persona === "strict") return "今天是休息日。散步、拉伸、睡够，恢复也是训练的一部分。";
    return "今天是休息日，不用跑。让身体把上次的训练消化掉，明天再出发。";
  }
  if (persona === "strict") return `今天的课是「${session.title}」。热身做足，配速稳住，不用冲。`;
  if (persona === "buddy") return `今天「${session.title}」，我陪你记着——跑完回来对数据。`;
  return `今天「${session.title}」，按自己的节奏来，跑完告诉我感觉。`;
}

/* =====================================================================
   今日课表（首页）：周期化周课表 + 今日卡 + 动态调整 + 打卡记录
   ===================================================================== */

export function RunningTodayPanel({ profile, tint, persona, projectTask }) {
  const { state, patch } = useBuddyState("running");
  const status = useMemo(() => getRunningStatus(profile?.answers || {}, profile, state), [profile, state]);
  const stats = useMemo(() => computeRunningStats(state), [state]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDate, setSheetDate] = useState(status.today);
  const [sheetSession, setSheetSession] = useState(status.todaySession);

  const injuries = activeInjuries(state);
  const kneeTracked = injuries.some((i) => String(i.area || "").includes("膝盖"));
  const bodyToday = (state.body || []).find((b) => b.date === status.today);
  const bodyTired = Boolean(bodyToday && (Number(bodyToday.fatigue) >= 4 || (Number(bodyToday.sleep_h) > 0 && Number(bodyToday.sleep_h) < 6)));
  const session = status.todaySession;
  const loggedToday = status.logsToday;
  const doneToday = loggedToday.length > 0;
  const weekKmPct = status.plannedKm > 0 ? Math.round((status.doneKm / status.plannedKm) * 100) : 0;

  const openLog = (date = status.today, s = status.todaySession) => {
    setSheetDate(date);
    setSheetSession(s);
    setSheetOpen(true);
  };

  const softenToday = () => {
    const base = status.todaySession;
    if (base.type === "strength") {
      patch({
        plan_overrides: {
          [status.today]: {
            type: "rest",
            detail: "今天不做力量也不跑，散步和拉伸 10 分钟就好。",
          },
        },
      });
      toast.success("已把今天改成轻量恢复");
      return;
    }
    const km = Math.max(1, Math.round((Number(base.km) || 3) * 0.65 * 2) / 2);
    const duration = Math.max(10, Math.round((Number(base.duration_min) || 25) * 0.7));
    patch({
      plan_overrides: {
        [status.today]: {
          type: "easy",
          title: "轻松跑（状态日）",
          detail: "今天只求动起来：能说完整句子，跑完不喘就对了。",
          km,
          duration_min: duration,
          pace: status.runner.easyPace,
          planned: true,
          clock: base.clock,
        },
      },
    });
    toast.success("已把今天降级为轻松跑，状态回来了再加量");
  };

  const reportKneePain = () => {
    const injury = {
      id: `${Date.now()}`,
      area: "膝盖",
      note: "跑步相关疼痛，已自动停跑，观察 48-72 小时",
      started_at: status.today,
      status: "active",
    };
    patch({
      injuries: [injury, ...(state.injuries || [])].slice(0, 40),
      plan_overrides: {
        [status.today]: {
          type: "rest",
          detail: "膝盖不适先停跑。可冰敷 15 分钟，明天改游泳/骑行/椭圆机。",
        },
      },
    });
    toast.success("今天先停跑，已记进伤病档案");
  };

  const moveSession = (fromDate, fromSession) => {
    let target = null;
    for (let i = 1; i <= 3; i++) {
      const key = addDays(status.today, i);
      if (status.schedule[key] && !status.schedule[key].planned) {
        target = key;
        break;
      }
    }
    if (!target) {
      patch({
        plan_overrides: {
          [fromDate]: { type: "rest", detail: "今天没跑也没关系。本周课表比较满，这一课不补，避免补偿性加量。" },
        },
      });
      toast.success("已改成休息日；缺的课不补，本周不硬塞");
      return;
    }
    patch({
      plan_overrides: {
        [fromDate]: { type: "rest", detail: "今天没跑也没关系，课已经挪到后面，安心休息。" },
        [target]: {
          ...fromSession,
          date: target,
          weekday: weekdayLabel(target),
          title: `${fromSession.title}（顺延）`,
          detail: `${fromSession.detail} 这是顺延的课，不用补跑两遍。`,
          movedFrom: fromDate,
          planned: true,
        },
      },
    });
    toast.success(`已把这课挪到周${weekdayLabel(target)}，今天不内耗`);
  };

  const softenWeek = () => {
    patch({ week_adjust: { week_stamp: status.weekStart, gentle: true } });
    toast.success("本周已整体降级：跑量减 20%，先把节奏找回来");
  };

  const lastWeek = useMemo(() => lastWeekSummary(state, status.runner, status), [state, status]);
  const nextSession = useMemo(
    () =>
      Object.values(status.schedule)
        .filter((s) => s.planned && s.date > status.today)
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null,
    [status]
  );
  const silenceDays = useMemo(() => {
    const lastDate = stats.lastLog?.date || status.firstDay;
    return Math.max(0, diffDays(lastDate, status.today));
  }, [stats.lastLog, status.firstDay, status.today]);

  const focusChat = () => {
    const input = document.querySelector('input[placeholder*="问点专业的"]');
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus();
  };

  return (
    <div className="space-y-4">
      <BuddyMsg tint={tint}>{runnerGreeting(persona, session)}</BuddyMsg>

      {injuries.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4" /> 正在跟踪：{injuries.map((i) => i.area).join("、")}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-700">
            疼痛没有消失前不安排跑步课。可以游泳、骑行或椭圆机，保持活动但不给关节冲击。
          </p>
        </div>
      )}

      {bodyTired && session.planned && !session.override && !doneToday && injuries.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[13px] leading-relaxed text-amber-800">
            今天睡得少或疲劳偏高。要不要把「{session.title}」降级成轻松跑？状态回来了再加量。
          </p>
          <button type="button" onClick={softenToday} className="mt-2 rounded-full bg-[#384877] px-3 py-1.5 text-[11px] font-medium text-white">
            降级今天
          </button>
        </div>
      )}

      {/* 今日主卡 */}
      {status.finished ? (
        <PanelCard dark>
          <div className="text-xs tracking-widest opacity-70">计划走完</div>
          <p className="mt-2 text-lg font-semibold">这段跑步计划已经到终点。</p>
          <p className="mt-2 text-sm leading-relaxed opacity-80">
            累计 {Math.round(stats.totalKm)} 公里、{stats.totalRuns} 次出发。去「画像」看看下一个目标，
            准备好了就用右上角的毕业礼收尾。
          </p>
        </PanelCard>
      ) : session.type === "rest" ? (
        <PanelCard>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] tracking-widest text-stone-400">今日 · 休息日</div>
              <p className="mt-1.5 text-lg font-semibold text-stone-900">今天不用跑</p>
              <p className="mt-1 text-[13px] leading-relaxed text-stone-500">{session.detail}</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
              <Moon className="h-5 w-5" />
            </span>
          </div>
          {nextSession && (
            <div className="mt-3 rounded-xl bg-[#FAF9F7] px-3.5 py-2.5 text-[12px] text-stone-500">
              下一课：周{nextSession.weekday}「{nextSession.title}」
              {nextSession.km ? ` · ${nextSession.km} km` : ""}
              {nextSession.clock ? ` · ${nextSession.clock}` : ""}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <TintButton tint={tint} outline className="flex-1" onClick={() => openLog()}>
              还是想动一动
            </TintButton>
            {loggedToday.length > 0 && (
              <TintButton tint={tint} className="flex-1" disabled>
                今天已记录
              </TintButton>
            )}
          </div>
        </PanelCard>
      ) : (
        <section className="overflow-hidden rounded-3xl bg-[#384877] text-[#FAF9F7]">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] tracking-widest" style={{ color: tint[1] }}>
                  第 {status.weekIndex + 1}/{status.totalWeeks} 周 · {status.runner.goalLabel}
                </div>
                <p className="mt-1.5 text-xl font-semibold">{session.title}</p>
                <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed opacity-80">{session.detail}</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Footprints className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
              {session.km > 0 && <span className="rounded-full bg-white/10 px-2.5 py-1">{session.km} km</span>}
              {session.duration_min > 0 && <span className="rounded-full bg-white/10 px-2.5 py-1">{formatDuration(session.duration_min)}</span>}
              {session.pace && <span className="rounded-full bg-white/10 px-2.5 py-1">配速 {formatPace(session.pace)}</span>}
              <span className="rounded-full bg-white/10 px-2.5 py-1">{session.clock ? `建议 ${session.clock}` : "你方便时"}</span>
              {session.override && <span className="rounded-full bg-white/15 px-2.5 py-1">已按状态调整</span>}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] opacity-75">
                <span>本周已完成 {status.doneDays.length}/{status.runDays.length} 次</span>
                <span>{status.doneKm.toFixed(1)} / {status.plannedKm.toFixed(1)} km</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, weekKmPct)}%`, background: tint[1] }} />
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 p-4">
            {doneToday ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">今天已完成 · {loggedToday[0].distance_km || 0} km</p>
                  <p className="mt-0.5 text-xs opacity-70">
                    {loggedToday[0].duration_min ? `${loggedToday[0].duration_min} 分钟 · ` : ""}
                    配速 {logPace(loggedToday[0])}
                  </p>
                </div>
                <button type="button" onClick={() => openLog(status.today, session)} className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100">
                  再记一次
                </button>
              </div>
            ) : (
              <>
                <TintButton tint={tint} className="w-full !bg-[#FAF9F7] !text-stone-900" onClick={() => openLog()}>
                  完成今天的课
                </TintButton>
                <div className="mt-2 flex items-center justify-center gap-4 text-[11px] opacity-70">
                  {!session.override && (
                    <button type="button" onClick={softenToday} className="hover:opacity-100">今天状态一般</button>
                  )}
                  {!kneeTracked && (
                    <button type="button" onClick={reportKneePain} className="hover:opacity-100">膝盖不舒服</button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* 缺跑 / 状态提示 */}
      {!doneToday && status.missed.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-[#FAF9F7] p-4">
          {status.missed.length === 1 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] leading-relaxed text-stone-600">
                周{status.missed[0].weekday}的「{status.missed[0].title}」没跑也没关系——要我把这课挪到明天吗？
              </p>
              <button type="button" onClick={() => moveSession(status.missed[0].date, status.missed[0])} className="shrink-0 text-xs font-medium text-[#384877] hover:underline">
                挪到明天
              </button>
            </div>
          ) : (
            <div>
              <p className="text-[13px] leading-relaxed text-stone-600">
                这周有 {status.missed.length} 次没跑。缺跑不补课，我们把本周目标调轻一点，别用补偿性加量惩罚自己。
              </p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={softenWeek} className="rounded-full bg-[#384877] px-3 py-1.5 text-[11px] font-medium text-white">
                  降级本周
                </button>
                <button type="button" onClick={() => moveSession(status.missed[0].date, status.missed[0])} className="rounded-full border border-stone-300 px-3 py-1.5 text-[11px] text-stone-600">
                  只顺延最近一课
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!doneToday && status.missed.length === 0 && injuries.length === 0 && silenceDays >= 3 && (
        <div className="rounded-2xl border border-stone-200 bg-[#FAF9F7] p-4">
          <p className="text-[13px] leading-relaxed text-stone-600">
            已经 {silenceDays} 天没有跑步记录了。不是催你——要不要把本周目标调轻，或者先聊聊最近卡在哪？
          </p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={softenWeek} className="rounded-full bg-[#384877] px-3 py-1.5 text-[11px] font-medium text-white">
              降级本周
            </button>
            <button type="button" onClick={focusChat} className="rounded-full border border-stone-300 px-3 py-1.5 text-[11px] text-stone-600">
              聊两句
            </button>
          </div>
        </div>
      )}

      {lastWeek?.allDone && (
        <div className="rounded-2xl bg-[#eef2ff] p-4 text-[13px] leading-relaxed text-[#384877]">
          上周的课全部完成——你准备好了。这周跑量按安全红线加了约 8%，注意睡眠和腿部反馈。
        </div>
      )}

      {state.last_feedback?.date === status.today && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-stone-200 bg-white p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tint[2] }} />
          <div>
            <div className="text-[11px] tracking-widest text-stone-400">跑后反馈</div>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{state.last_feedback.text}</p>
            {state.last_feedback.achievement && (
              <p className="mt-1 text-[12px] font-medium" style={{ color: tint[2] }}>🏅 {state.last_feedback.achievement}</p>
            )}
          </div>
        </div>
      )}

      {/* 本周课表 */}
      <PanelCard
        title="本周课表"
        extra={<span className="text-xs text-stone-400">{status.runner.goalLabel} · 第 {status.weekIndex + 1} 周</span>}
      >
        <div className="mt-3 space-y-1">
          {Object.values(status.schedule)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((s) => {
              const log = (state.logs || []).find((l) => l?.date === s.date);
              const isToday = s.date === status.today;
              return (
                <div
                  key={s.date}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2",
                    isToday ? "bg-[#FAF9F7]" : ""
                  )}
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium", SESSION_COLOR[s.type] || SESSION_COLOR.rest)}>
                    {s.planned ? (log ? <Check className="h-3.5 w-3.5" /> : s.weekday) : "·"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("truncate text-[13px]", s.planned ? "font-medium text-stone-800" : "text-stone-400")}>{s.title}</span>
                      {isToday && <span className="shrink-0 rounded-full bg-[#384877] px-1.5 py-0.5 text-[9px] text-white">今天</span>}
                    </div>
                    <p className="mt-0.5 text-[10px] text-stone-400">
                      {shortDate(s.date)} 周{s.weekday}
                      {s.planned ? ` · ${s.km ? `${s.km} km · ` : ""}${formatDuration(s.duration_min)}` : " · 恢复"}
                    </p>
                  </div>
                  {s.planned && (
                    log ? (
                      <span className="shrink-0 text-[10px] text-emerald-600">{log.distance_km || 0} km</span>
                    ) : s.date <= status.today ? (
                      <button type="button" onClick={() => openLog(s.date, s)} className="shrink-0 text-[10px] text-stone-400 hover:text-[#384877]">
                        {s.date < status.today ? "补记" : "记录"}
                      </button>
                    ) : (
                      <span className="shrink-0 text-[10px] text-stone-300">计划</span>
                    )
                  )}
                </div>
              );
            })}
        </div>
        {projectTask && (
          <p className="mt-3 border-t border-stone-100 pt-2.5 text-[11px] text-stone-400">
            计划已同步到约定页「{projectTask.title}」，课表变化会留痕。
          </p>
        )}
      </PanelCard>

      <RunLogSheet
        open={sheetOpen}
        date={sheetDate}
        session={sheetSession}
        tint={tint}
        answers={profile?.answers}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

/* =====================================================================
   记录：跑量趋势 / PB 墙 / 近期记录 / 周复盘
   ===================================================================== */

export function RunningLogPanel({ profile, tint }) {
  const { state, patch } = useBuddyState("running");
  const status = useMemo(() => getRunningStatus(profile?.answers || {}, profile, state), [profile, state]);
  const stats = useMemo(() => computeRunningStats(state), [state]);
  const series = useMemo(() => weeklyKmSeries(state, 8), [state]);
  const maxKm = Math.max(...series.map((s) => s.km), 1);
  const [sheetOpen, setSheetOpen] = useState(false);

  const removeLog = (id) => {
    const target = (state.logs || []).find((l) => l.id === id);
    if (!target) return;
    const shoes = state.gear?.shoes;
    let gearPatch = null;
    if (Array.isArray(shoes) && shoes.length > 0) {
      const defaultShoe = shoes.find((s) => s.id === state.gear?.default_shoe_id) || shoes[0];
      gearPatch = {
        gear: {
          ...(state.gear || {}),
          shoes: shoes.map((s) =>
            s.id === defaultShoe.id ? { ...s, km: Math.max(0, Math.round(((Number(s.km) || 0) - (Number(target.distance_km) || 0)) * 10) / 10) } : s
          ),
        },
      };
    }
    patch({
      logs: (state.logs || []).filter((l) => l.id !== id),
      ...(state.last_feedback?.date === target.date ? { last_feedback: null } : {}),
      ...(gearPatch || {}),
    });
    toast.success("已删除这条记录");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-semibold text-stone-900">跑步记录</h2>
          <p className="mt-0.5 text-[12px] text-stone-400">所有出发都算数，不只看配速</p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-xs font-medium text-white"
          style={{ background: tint[2] }}
        >
          <Plus className="h-3.5 w-3.5" /> 补记一次
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Footprints} label="累计里程" value={`${Math.round(stats.totalKm)}`} unit="km" tint={tint} />
        <StatTile icon={Activity} label="跑步次数" value={stats.totalRuns} unit="次" tint={tint} />
        <StatTile icon={Timer} label="最佳配速" value={stats.bestPace ? formatPace(stats.bestPace) : "—"} tint={tint} />
        <StatTile icon={TrendingUp} label="连续周" value={stats.streakWeeks} unit="周" tint={tint} />
      </div>

      <PanelCard title="近 8 周跑量" extra={<span className="text-xs text-stone-400">本周 {stats.thisWeekKm.toFixed(1)} km</span>}>
        <div className="mt-3 flex h-28 items-end justify-between gap-1.5">
          {series.map((s, i) => (
            <div key={s.weekStart} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] text-stone-400">{s.km > 0 ? s.km : ""}</span>
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{
                  height: Math.max(4, (s.km / maxKm) * 78),
                  background: i === series.length - 1 ? tint[2] : tint[0],
                }}
              />
              <span className="text-[9px] text-stone-400">{s.label}</span>
            </div>
          ))}
        </div>
      </PanelCard>

      <div className="grid grid-cols-3 gap-2.5">
        <PanelCard>
          <div className="text-[10px] text-stone-400">最长距离</div>
          <div className="mt-1 text-lg font-semibold text-stone-900">{stats.longest || 0}<span className="ml-0.5 text-[11px] font-normal text-stone-400">km</span></div>
        </PanelCard>
        <PanelCard>
          <div className="text-[10px] text-stone-400">本月跑量</div>
          <div className="mt-1 text-lg font-semibold text-stone-900">{Math.round(stats.thisMonthKm)}<span className="ml-0.5 text-[11px] font-normal text-stone-400">km</span></div>
        </PanelCard>
        <PanelCard>
          <div className="text-[10px] text-stone-400">最近状态</div>
          <div className="mt-1 text-lg font-semibold text-stone-900">{stats.avgRpe ? stats.avgRpe.toFixed(1) : "—"}<span className="ml-0.5 text-[11px] font-normal text-stone-400">/5</span></div>
        </PanelCard>
      </div>

      <RunningWeeklyReview state={state} patch={patch} status={status} tint={tint} />

      <PanelCard title="近期记录" extra={<span className="text-xs text-stone-400">{stats.totalRuns} 次</span>}>
        {stats.logs.length === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-stone-400">
            还没有记录。跑完点上面的「补记一次」，或者把运动 App 的截图发给我，我帮你填。
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100">
            {stats.logs.slice(0, 12).map((log) => (
              <li key={log.id} className="flex items-start gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint[0], color: tint[2] }}>
                  <Footprints className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-stone-800">{log.title || "跑步"}</p>
                    <span className="shrink-0 text-[10px] text-stone-400">{shortDate(log.date)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    {log.distance_km || 0} km
                    {log.duration_min ? ` · ${log.duration_min} 分钟` : ""}
                    {` · 配速 ${logPace(log)}`}
                    {log.rpe ? ` · RPE ${log.rpe}/5` : ""}
                    {log.avg_hr ? ` · 心率 ${log.avg_hr}` : ""}
                  </p>
                  {log.note && <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{log.note}</p>}
                </div>
                <button type="button" onClick={() => removeLog(log.id)} aria-label="删除记录" className="shrink-0 p-1 text-stone-300 hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <RunLogSheet
        open={sheetOpen}
        date={status.today}
        session={status.todaySession}
        tint={tint}
        answers={profile?.answers}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

function StatTile({ icon: Icon, label, value, unit, tint }) {
  return (
    <PanelCard>
      <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold text-stone-900">
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-normal text-stone-400">{unit}</span>}
      </div>
      <div className="mt-1 h-1 rounded-full" style={{ background: tint[0] }} />
    </PanelCard>
  );
}

function RunningWeeklyReview({ state, patch, status, tint }) {
  const { call } = useBuddyAgent("running");
  const [generating, setGenerating] = useState(false);
  const stats = useMemo(() => computeRunningStats(state), [state]);
  const body = latestBody(state);
  const report = state.run_weekly?.week_stamp === status.weekStart ? state.run_weekly : null;

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const injuries = activeInjuries(state);
      const statsText = [
        `目标 ${status.runner.goalLabel}，第 ${status.weekIndex + 1}/${status.totalWeeks} 周`,
        `本周计划 ${status.runDays.length} 次 ${status.plannedKm.toFixed(1)} km，已完成 ${status.doneDays.length} 次 ${status.doneKm.toFixed(1)} km`,
        `累计 ${Math.round(stats.totalKm)} km / ${stats.totalRuns} 次，最佳配速 ${formatPace(stats.bestPace)}，连续 ${stats.streakWeeks} 周`,
        body?.fatigue ? `最近疲劳 ${body.fatigue}/5，睡眠 ${body.sleep_h || "未记录"} 小时` : "近期身体状态未记录",
        injuries.length ? `在跟踪伤病：${injuries.map((i) => i.area).join("、")}` : "无在跟踪伤病",
      ].join("；");
      const data = await call({ mode: "weekly", payload: { stats: statsText } });
      patch({ run_weekly: { week_stamp: status.weekStart, ...data } });
    } catch (e) {
      toast.error(e?.message || "复盘没生成成功，再试一次");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PanelCard
      title="回望与远见 · 周复盘"
      extra={
        <button type="button" onClick={generate} disabled={generating} className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 disabled:opacity-50">
          <RefreshCw className={cn("h-3 w-3", generating && "animate-spin")} /> {report ? "重新生成" : "生成"}
        </button>
      }
    >
      {report ? (
        <div className="mt-3 space-y-3">
          <p className="text-[14px] leading-relaxed text-stone-700">{report.summary}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#FAF9F7] p-3">
              <div className="text-[10px] text-stone-400">最强项</div>
              <div className="mt-0.5 text-[13px] font-medium text-stone-800">{report.strongest || "—"}</div>
            </div>
            <div className="rounded-xl bg-[#FAF9F7] p-3">
              <div className="text-[10px] text-stone-400">要关注</div>
              <div className="mt-0.5 text-[13px] font-medium text-stone-800">{report.weakest || "—"}</div>
            </div>
          </div>
          {(report.next_week || []).length > 0 && (
            <ul className="space-y-1.5">
              {report.next_week.map((n) => (
                <li key={n} className="flex items-start gap-2 text-[13px] leading-relaxed text-stone-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint[2] }} />
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-stone-500">
          每周日回看一次：跑量、完成率、配速和身体信号。缺跑不会挨批，只会把下周计划调轻。
        </p>
      )}
    </PanelCard>
  );
}

/* =====================================================================
   身体：体重 / 睡眠 / 静息心率 / 疲劳 + 伤病档案
   ===================================================================== */

export function RunningBodyPanel({ profile, tint }) {
  const { state, patch } = useBuddyState("running");
  const today = todayKey();
  const runner = useMemo(() => buildRunnerProfile(profile?.answers || {}), [profile]);
  const latest = latestBody(state);
  const todayEntry = (state.body || []).find((b) => b.date === today);
  const [form, setForm] = useState({
    weight: "",
    sleep_h: "",
    resting_hr: "",
    fatigue: 3,
    note: "",
  });
  const hydrated = useRef(null);
  const [injuryOpen, setInjuryOpen] = useState(false);
  const [injuryArea, setInjuryArea] = useState("膝盖");
  const [injuryNote, setInjuryNote] = useState("");

  useEffect(() => {
    const source = todayEntry || latest;
    if (!source || hydrated.current === source.date) return;
    hydrated.current = source.date;
    setForm({
      weight: source.weight ? String(source.weight) : "",
      sleep_h: source.sleep_h ? String(source.sleep_h) : "",
      resting_hr: source.resting_hr ? String(source.resting_hr) : "",
      fatigue: Number(source.fatigue) || 3,
      note: source.note || "",
    });
  }, [todayEntry, latest]);

  const saveBody = () => {
    const entry = {
      date: today,
      weight: Number(form.weight) || null,
      sleep_h: Number(form.sleep_h) || null,
      resting_hr: Number(form.resting_hr) || null,
      fatigue: Number(form.fatigue) || 3,
      note: form.note.trim(),
    };
    patch({ body: [entry, ...(state.body || []).filter((b) => b.date !== today)].slice(0, 120) });
    toast.success("今天的身体状态已记下");
  };

  const addInjury = () => {
    if (!injuryArea) return;
    const injury = {
      id: `${Date.now()}`,
      area: injuryArea,
      note: injuryNote.trim() || "训练相关不适",
      started_at: today,
      status: "active",
    };
    patch({ injuries: [injury, ...(state.injuries || [])].slice(0, 40) });
    setInjuryNote("");
    setInjuryOpen(false);
    toast.success(`已记录${injuryArea}不适，先停跑观察`);
  };

  const recoverInjury = (id) => {
    patch({
      injuries: (state.injuries || []).map((i) => (i.id === id ? { ...i, status: "recovered", recovered_at: today } : i)),
    });
    toast.success("已标记恢复，回归前先安排一次轻松跑");
  };

  const sleepTrend = bodyTrend(state, "sleep_h", 7);
  const weightTrend = bodyTrend(state, "weight", 7);
  const hrTrend = bodyTrend(state, "resting_hr", 7);
  const maxSleep = Math.max(...sleepTrend.map((s) => s.value), 8);
  const warning =
    form.fatigue >= 4 || (Number(form.sleep_h) > 0 && Number(form.sleep_h) < 6) || activeInjuries(state).length > 0;

  return (
    <div className="space-y-4">
      {warning && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> 今天更适合恢复
          </div>
          <p className="mt-1">
            身体信号偏累或仍有疼痛在跟踪。把高强度课换成轻松跑/交叉训练，睡够比多跑更重要。
          </p>
        </div>
      )}

      <PanelCard title="今日身体状态" extra={<span className="text-xs text-stone-400">{today}</span>}>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="text-[11px] text-stone-400">
            体重 kg
            <input
              type="number"
              inputMode="decimal"
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
              placeholder={runner.body.weight ? String(runner.body.weight) : "可选"}
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
            />
          </label>
          <label className="text-[11px] text-stone-400">
            睡眠 小时
            <input
              type="number"
              inputMode="decimal"
              value={form.sleep_h}
              onChange={(e) => setForm((f) => ({ ...f, sleep_h: e.target.value }))}
              placeholder="如 7.5"
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
            />
          </label>
          <label className="text-[11px] text-stone-400">
            静息心率 bpm
            <input
              type="number"
              inputMode="numeric"
              value={form.resting_hr}
              onChange={(e) => setForm((f) => ({ ...f, resting_hr: e.target.value }))}
              placeholder={runner.body.restingHr ? String(runner.body.restingHr) : "可选"}
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
            />
          </label>
          <div className="text-[11px] text-stone-400">
            疲劳感 {form.fatigue}/5
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, fatigue: n }))}
                  aria-pressed={form.fatigue === n}
                  className={cn(
                    "h-8 flex-1 rounded-lg text-xs transition-colors",
                    form.fatigue === n ? "text-white" : "bg-[#FAF9F7] text-stone-500"
                  )}
                  style={form.fatigue === n ? { background: tint[2] } : undefined}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <input
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="今天身体还有什么想说的？（可选）"
          className="mt-2.5 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
        />
        <TintButton tint={tint} onClick={saveBody} className="mt-3 w-full">
          记下今天
        </TintButton>
      </PanelCard>

      {sleepTrend.length > 0 && (
        <PanelCard title="近 7 次睡眠" extra={<span className="text-xs text-stone-400">{sleepTrend.length} 条</span>}>
          <div className="mt-3 flex h-24 items-end justify-between gap-2">
            {sleepTrend.map((s, i) => (
              <div key={`${s.date}-${i}`} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-stone-400">{s.value}h</span>
                <div
                  className="w-full rounded-t-md"
                  style={{ height: Math.max(6, (s.value / maxSleep) * 64), background: i === sleepTrend.length - 1 ? tint[2] : tint[0] }}
                />
                <span className="text-[9px] text-stone-400">{shortDate(s.date)}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      )}

      {(weightTrend.length > 0 || hrTrend.length > 0) && (
        <PanelCard title="体重与静息心率">
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#FAF9F7] p-3">
              <div className="text-[10px] text-stone-400">最近体重</div>
              <div className="mt-1 text-lg font-semibold text-stone-900">
                {weightTrend.length ? weightTrend[weightTrend.length - 1].value : "—"}
                <span className="ml-0.5 text-[11px] font-normal text-stone-400">kg</span>
              </div>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {weightTrend.length > 1
                  ? `近 ${weightTrend.length} 次 ${Math.min(...weightTrend.map((w) => w.value))}-${Math.max(...weightTrend.map((w) => w.value))} kg`
                  : "继续记录才能看到趋势"}
              </p>
            </div>
            <div className="rounded-xl bg-[#FAF9F7] p-3">
              <div className="text-[10px] text-stone-400">静息心率</div>
              <div className="mt-1 text-lg font-semibold text-stone-900">
                {hrTrend.length ? hrTrend[hrTrend.length - 1].value : "—"}
                <span className="ml-0.5 text-[11px] font-normal text-stone-400">bpm</span>
              </div>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {hrTrend.length > 1
                  ? `近 ${hrTrend.length} 次 ${Math.min(...hrTrend.map((h) => h.value))}-${Math.max(...hrTrend.map((h) => h.value))} bpm`
                  : "晨起静息心率最有参考价值"}
              </p>
            </div>
          </div>
        </PanelCard>
      )}

      <PanelCard
        title="伤病档案"
        extra={
          <button type="button" onClick={() => setInjuryOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
            <Plus className="h-3 w-3" /> 记录不适
          </button>
        }
      >
        {injuryOpen && (
          <div className="mt-3 rounded-xl bg-[#FAF9F7] p-3">
            <div className="flex flex-wrap gap-1.5">
              {["膝盖", "脚踝", "足底", "小腿", "髋部"].map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => setInjuryArea(area)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px]",
                    injuryArea === area ? "text-white" : "bg-white text-stone-500 border border-stone-200"
                  )}
                  style={injuryArea === area ? { background: tint[2] } : undefined}
                >
                  {area}
                </button>
              ))}
            </div>
            <input
              value={injuryNote}
              onChange={(e) => setInjuryNote(e.target.value)}
              placeholder="什么情况下痛？刺痛还是酸胀？（可选）"
              className="mt-2 h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-xs text-stone-700 outline-none focus:border-[#384877]"
            />
            <button type="button" onClick={addInjury} className="mt-2 w-full rounded-full py-2 text-xs font-medium text-white" style={{ background: tint[2] }}>
              记入档案并停跑
            </button>
          </div>
        )}
        {(state.injuries || []).length === 0 ? (
          <p className="mt-2 text-[13px] leading-relaxed text-stone-400">还没有伤病记录。疼痛出现时记一笔，我会调整课表。</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(state.injuries || []).slice(0, 8).map((inj) => (
              <li key={inj.id} className="flex items-start gap-2.5 rounded-xl bg-[#FAF9F7] p-3">
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", inj.status === "recovered" ? "bg-emerald-50 text-emerald-600" : "bg-amber-100 text-amber-700")}>
                  {inj.status === "recovered" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13px] font-medium text-stone-800">{inj.area}</p>
                    <span className="text-[10px] text-stone-400">{shortDate(inj.started_at)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">{inj.note}</p>
                  {inj.status !== "recovered" && (
                    <button type="button" onClick={() => recoverInjury(inj.id)} className="mt-1 text-[11px] text-[#384877] hover:underline">
                      标记已恢复
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

/* =====================================================================
   装备与知识：跑鞋里程 + 知识卡（收下即沉淀心签）
   ===================================================================== */

export function RunningGearPanel({ profile, tint }) {
  const { state, patch } = useBuddyState("running");
  const [shoeName, setShoeName] = useState("");
  const [shoeKm, setShoeKm] = useState("");
  const [expanded, setExpanded] = useState(null);
  const gears = state.gear || {};
  const shoes = Array.isArray(gears.shoes) ? gears.shoes : [];
  const defaultId = gears.default_shoe_id || shoes[0]?.id;

  const saveShoes = (nextShoes, nextDefault = defaultId) => {
    patch({ gear: { ...gears, shoes: nextShoes, default_shoe_id: nextDefault } });
  };

  const addShoe = () => {
    const name = shoeName.trim();
    if (!name) return;
    const shoe = {
      id: `${Date.now()}`,
      name,
      km: Math.max(0, Number(shoeKm) || 0),
      started_at: todayKey(),
    };
    saveShoes([...shoes, shoe], defaultId || shoe.id);
    setShoeName("");
    setShoeKm("");
    toast.success(`已加入「${name}」，每次记录会自动累加里程`);
  };

  return (
    <div className="space-y-4">
      <PanelCard title="跑鞋里程" extra={<span className="text-xs text-stone-400">{shoes.length} 双</span>}>
        <p className="mt-1 text-[12px] leading-relaxed text-stone-400">
          600 公里开始留意，800 公里建议更换。记录跑步时会自动加到默认跑鞋上。
        </p>
        <div className="mt-3 space-y-2.5">
          {shoes.length === 0 && <p className="text-[13px] text-stone-400">还没有跑鞋记录。加上现在这双，里程就不会丢。</p>}
          {shoes.map((shoe) => {
            const km = Number(shoe.km) || 0;
            const pct = Math.min(100, Math.round((km / 800) * 100));
            const due = km >= 800;
            const warn = km >= 600 && !due;
            return (
              <div key={shoe.id} className="rounded-xl bg-[#FAF9F7] p-3.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: tint[0], color: tint[2] }}>
                    <Footprints className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-stone-800">{shoe.name}</span>
                      {shoe.id === defaultId && <span className="shrink-0 rounded-full bg-[#384877] px-1.5 py-0.5 text-[9px] text-white">默认</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      已跑 {Math.round(km)} km · {due ? "建议更换" : warn ? "进入更换观察期" : `还可跑约 ${Math.round(800 - km)} km`}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: due ? "#e11d48" : warn ? "#d97706" : tint[2] }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {shoe.id !== defaultId && (
                      <button type="button" onClick={() => saveShoes(shoes, shoe.id)} className="text-[10px] text-[#384877] hover:underline">
                        设为默认
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const remaining = shoes.filter((s) => s.id !== shoe.id);
                        const nextDefault = remaining.some((s) => s.id === defaultId) ? defaultId : remaining[0]?.id || null;
                        saveShoes(remaining, nextDefault);
                      }}
                      className="p-1 text-stone-300 hover:text-rose-500"
                      aria-label="删除跑鞋"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={shoeName}
            onChange={(e) => setShoeName(e.target.value)}
            placeholder="跑鞋名称，如「飞马 40」"
            className="h-10 min-w-0 flex-1 rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
          />
          <input
            type="number"
            inputMode="numeric"
            value={shoeKm}
            onChange={(e) => setShoeKm(e.target.value)}
            placeholder="已跑 km"
            className="h-10 w-24 rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
          />
          <button type="button" onClick={addShoe} disabled={!shoeName.trim()} className="h-10 shrink-0 rounded-xl px-3.5 text-xs font-medium text-white disabled:opacity-50" style={{ background: tint[2] }}>
            添加
          </button>
        </div>
      </PanelCard>

      <KnowledgeCard tint={tint} state={state} patch={patch} expanded={expanded} setExpanded={setExpanded} />

      <PanelCard>
        <div className="flex items-start gap-2.5">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tint[2] }} />
          <p className="text-[12px] leading-relaxed text-stone-500">
            跑步数据留在领域档案里；只有「晨跑后上午精力更好」这类规律会回写主档案，帮通用层排日程。
          </p>
        </div>
      </PanelCard>
    </div>
  );
}

function KnowledgeCard({ tint, state, patch, expanded, setExpanded }) {
  const accepted = state.knowledge_accepted || [];
  const list = RUNNING_KNOWLEDGE;

  const accept = async (card) => {
    if (accepted.includes(card.id)) return;
    patch({ knowledge_accepted: [...accepted, card.id] });
    try {
      await base44.entities.Note.create({
        title: `跑步知识 · ${card.title}`,
        content: card.body,
        source_type: "memo",
        tags: ["跑步", "心签", card.tag],
        metadata: {
          _extraFields: {
            source_buddy: "running",
            source_buddy_name: "跑步搭子",
            source_scene: "装备与知识",
          },
        },
      });
      toast.success("已收进心签，随时翻得回来");
    } catch (_e) {
      toast.error("心签没存上，但知识卡已经在本地收下了");
    }
  };

  return (
    <PanelCard
      title="装备与知识"
      extra={<span className="text-xs text-stone-400">{accepted.length}/{RUNNING_KNOWLEDGE.length} 已收下</span>}
    >
      <div className="mt-2 divide-y divide-stone-100">
        {list.map((card) => {
          const open = expanded === card.id;
          const saved = accepted.includes(card.id);
          return (
            <div key={card.id} className="py-2.5">
              <button type="button" onClick={() => setExpanded(open ? null : card.id)} className="flex w-full items-start gap-2 text-left">
                <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px]" style={{ background: tint[0], color: tint[2] }}>{card.tag}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-stone-800">{card.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-400">{card.summary}</span>
                </span>
                <ChevronDown className={cn("mt-1 h-3.5 w-3.5 shrink-0 text-stone-300 transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="mt-2 rounded-xl bg-[#FAF9F7] p-3">
                  <p className="text-[12px] leading-relaxed text-stone-600">{card.body}</p>
                  <button
                    type="button"
                    onClick={() => accept(card)}
                    disabled={saved}
                    className="mt-2 rounded-full px-3 py-1.5 text-[11px] font-medium text-white disabled:bg-stone-200 disabled:text-stone-400"
                    style={saved ? undefined : { background: tint[2] }}
                  >
                    {saved ? "已收进心签" : "收下这张知识卡"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}

/* =====================================================================
   画像：能力画像 / 成就 / 领域档案 / 下一个目标
   ===================================================================== */

export function RunningProfilePanel({ profile, tint }) {
  const { state } = useBuddyState("running");
  const status = useMemo(() => getRunningStatus(profile?.answers || {}, profile, state), [profile, state]);
  const stats = useMemo(() => computeRunningStats(state), [state]);
  const consistency = useMemo(() => computeConsistency(state, status.runner, status), [state, status]);
  const abilities = useMemo(() => getAbilityProfile(state, status.runner, status, consistency), [state, status, consistency]);
  const achievements = useMemo(() => computeAchievements(state), [state]);
  const body = latestBody(state);
  const days = profile?.claimed_at ? Math.max(1, Math.ceil((Date.now() - new Date(profile.claimed_at).getTime()) / 86400000)) : null;
  const next = nextGoalFor(status.runner.goalKey);
  const readyForNext = status.finished || status.weekIndex >= status.totalWeeks - 2;

  return (
    <div className="space-y-4">
      <PanelCard dark>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-widest opacity-70">跑步画像 · 第 {Math.min(status.weekIndex + 1, status.totalWeeks)}/{status.totalWeeks} 周</div>
            <p className="mt-1.5 text-lg font-semibold">{status.runner.goalLabel}</p>
            <p className="mt-1 text-[13px] leading-relaxed opacity-75">{status.runner.goalNote}</p>
          </div>
          <Trophy className="h-7 w-7 shrink-0 opacity-70" />
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((status.weekIndex + 1) / status.totalWeeks) * 100)}%`, background: tint[1] }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] opacity-70">
          <span>开始 {shortDate(status.firstDay)}</span>
          <span>目标 {status.totalWeeks} 周</span>
        </div>
      </PanelCard>

      <PanelCard title="能力画像">
        <div className="mt-3 space-y-3.5">
          {abilities.map((a) => {
            const risky = a.inverse && a.value >= 60;
            return (
              <div key={a.key}>
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="font-medium text-stone-700">{a.label}</span>
                  <span className="text-stone-400">{a.value}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full" style={{ width: `${a.value}%`, background: risky ? "#e11d48" : tint[2] }} />
                </div>
                <p className="mt-0.5 text-[10px] text-stone-400">{a.note}</p>
              </div>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard title="成就墙" extra={<span className="text-xs text-stone-400">{achievements.filter((a) => a.earned).length}/{achievements.length}</span>}>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={cn("rounded-xl border p-2.5", a.earned ? "border-[#c9d5ef] bg-[#eef2ff]/60" : "border-stone-100 bg-[#FAF9F7] opacity-60")}
            >
              <Medal className={cn("h-4 w-4", a.earned ? "text-[#384877]" : "text-stone-300")} />
              <p className="mt-1 text-[11px] font-medium text-stone-700">{a.title}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-stone-400">{a.desc}</p>
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard title="领域档案 · 仅跑步搭子可见">
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.values(profile?.answers || {})
            .filter((v) => v && v !== "稍后填")
            .map((v, i) => (
              <span key={`${v}-${i}`} className="rounded-full bg-[#FAF9F7] px-2.5 py-1 text-[11px] text-stone-600">{v}</span>
            ))}
          {body?.weight && <span className="rounded-full bg-[#FAF9F7] px-2.5 py-1 text-[11px] text-stone-600">体重 {body.weight} kg</span>}
          {body?.resting_hr && <span className="rounded-full bg-[#FAF9F7] px-2.5 py-1 text-[11px] text-stone-600">静息心率 {body.resting_hr}</span>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
          配速、跑量、心率、伤病史和装备只留在本搭子；作息与精力规律才回写主档案。
        </p>
      </PanelCard>

      <PanelCard title="陪伴统计">
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold" style={{ color: tint[2] }}>{days ? `${days} 天` : "—"}</div>
            <div className="mt-0.5 text-[10px] text-stone-400">相伴时长</div>
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ color: tint[2] }}>{stats.totalRuns}</div>
            <div className="mt-0.5 text-[10px] text-stone-400">累计出发</div>
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ color: tint[2] }}>{Math.round(stats.totalKm)}</div>
            <div className="mt-0.5 text-[10px] text-stone-400">累计公里</div>
          </div>
        </div>
      </PanelCard>

      {readyForNext && next && (
        <PanelCard dark>
          <div className="flex items-center gap-2 text-[11px] tracking-widest opacity-70">
            <Sparkles className="h-3.5 w-3.5" /> 毕业与下一程
          </div>
          <p className="mt-2 text-[15px] font-semibold">{next.label}</p>
          <p className="mt-1 text-[13px] leading-relaxed opacity-75">{next.advice}</p>
          <p className="mt-2 text-[11px] leading-relaxed opacity-60">
            计划走完后用右上角的毕业礼收尾，约定与记录都会保留；想继续，就带着新目标再认领一次。
            {(status.runner.goalKey === "half" || status.runner.goalKey === "full") &&
              " 想去外地跑比赛，毕业后可以让旅游搭子接着帮你排行程。"}
          </p>
        </PanelCard>
      )}
    </div>
  );
}

/* =====================================================================
   记录弹层：手动记录 / 运动截图识别
   ===================================================================== */

export function RunLogSheet({ open, date, session, tint, answers, onClose }) {
  const { state, patch } = useBuddyState("running");
  const { call } = useBuddyAgent("running");
  const runner = useMemo(() => buildRunnerProfile(answers || {}), [answers]);
  const [formDate, setFormDate] = useState(date || todayKeyBJ());
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState(3);
  const [feel, setFeel] = useState("不错");
  const [avgHr, setAvgHr] = useState("");
  const [note, setNote] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFormDate(date || todayKeyBJ());
    setDistance(session?.km ? String(session.km) : "");
    setDuration(session?.duration_min ? String(session.duration_min) : "");
    setRpe(3);
    setFeel("不错");
    setAvgHr("");
    setNote("");
  }, [open, date, session]);

  if (!open) return null;

  const parseScreenshot = async (file) => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploaded = await httpRequest("/api/uploads", { method: "POST", body: fd });
      const data = await call({
        mode: "run_parse",
        payload: {
          attachments: [{ url: uploaded.file_url, name: uploaded.file_name, type: uploaded.file_type }],
          text: note || undefined,
        },
      });
      const gotDistance = Number(data?.distance_km) > 0;
      const gotDuration = Number(data?.duration_min) > 0;
      if (gotDistance) setDistance(String(data.distance_km));
      if (gotDuration) setDuration(String(Math.round(Number(data.duration_min) * 10) / 10));
      if (Number(data?.avg_hr) > 0) setAvgHr(String(Math.round(Number(data.avg_hr))));
      if (data?.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) setFormDate(data.date);
      if (gotDistance || gotDuration) {
        toast.success("已识别截图数据，确认或修改后保存");
      } else {
        toast.info("截图里没读到明确的跑量，手动补一下就好");
      }
    } catch (e) {
      toast.error(e?.message || "截图识别失败，可以手动填");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    if (saving) return;
    const dist = Number(distance) || 0;
    const dur = Number(duration) || 0;
    if (!dist && !dur) {
      toast.error("至少填一下距离或用时");
      return;
    }
    setSaving(true);
    const pacesec = session?.pace || runner.easyPace || 420;
    const finalDist = dist || Math.round((dur / (pacesec / 60)) * 100) / 100;
    const finalDur = dur || Math.round((finalDist * pacesec) / 60);
    const previousStats = computeRunningStats(state);
    const log = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: formDate,
      type: session?.type || "easy",
      title: session?.type === "rest" ? "自由跑" : session?.title || "自由跑",
      distance_km: Math.round(finalDist * 100) / 100,
      duration_min: Math.round(finalDur),
      rpe: Number(rpe) || 3,
      feel,
      avg_hr: Number(avgHr) || null,
      note: note.trim(),
      source: "manual",
      created_at: new Date().toISOString(),
    };
    const logs = [log, ...(state.logs || [])].slice(0, 150);
    const shoes = state.gear?.shoes;
    const patchData = { logs };
    if (Array.isArray(shoes) && shoes.length > 0) {
      const defaultShoe = shoes.find((s) => s.id === state.gear?.default_shoe_id) || shoes[0];
      patchData.gear = {
        ...(state.gear || {}),
        default_shoe_id: defaultShoe.id,
        shoes: shoes.map((s) =>
          s.id === defaultShoe.id ? { ...s, km: Math.round(((Number(s.km) || 0) + log.distance_km) * 10) / 10 } : s
        ),
      };
    }
    const paceSec = log.distance_km > 0 ? (log.duration_min * 60) / log.distance_km : null;
    const pace = paceSec ? formatPace(paceSec) : "—";
    const tired = log.feel === "很累" || log.rpe >= 4;
    const crossed100 = previousStats.totalKm < 100 && previousStats.totalKm + log.distance_km >= 100;
    const crossed50 = previousStats.totalKm < 50 && previousStats.totalKm + log.distance_km >= 50;
    const previousSameType = (state.logs || []).find(
      (l) => l.type === log.type && Number(l.distance_km) >= 3 && Number(l.duration_min) > 0
    );
    let comparison = "";
    if (paceSec && previousSameType) {
      const previousPace = (Number(previousSameType.duration_min) * 60) / Number(previousSameType.distance_km);
      const delta = Math.round(previousPace - paceSec);
      if (delta > 5) comparison = `比上次同类型快了 ${delta} 秒/公里。`;
      else if (delta < -5) comparison = `比上次同类型慢了 ${Math.abs(delta)} 秒/公里，注意恢复。`;
      else comparison = "和上次同类型配速接近。";
    }
    if (Number(avgHr) > 0 && Number(previousSameType?.avg_hr) > 0) {
      const hrDelta = Math.round(Number(avgHr) - Number(previousSameType.avg_hr));
      if (hrDelta >= 5) comparison += ` 同样配速下心率比上次高 ${hrDelta}，可能有点累，明天注意休息。`;
    }
    const newPb = paceSec && (!previousStats.bestPace || paceSec < previousStats.bestPace);
    const first5k = previousStats.longest < 5 && log.distance_km >= 5;
    const achievement = crossed100
      ? "百公里俱乐部达成！"
      : crossed50
        ? "累计 50 公里达成！"
        : first5k
          ? "第一次跑满 5 公里！"
          : newPb
            ? "刷新个人最佳配速！"
            : null;
    patchData.last_feedback = {
      date: formDate,
      text: `这次 ${log.distance_km} km，用时 ${log.duration_min} 分钟，平均配速 ${pace}。${comparison}${
        tired ? "身体偏累，明天优先休息或轻松跑，别再加速度。" : "恢复不错，补水、拉伸，今晚早点睡。"
      }`,
      achievement,
    };
    patch(patchData);
    toast.success("记录已保存，这一步算数");
    setSaving(false);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#384877]/45 p-0 sm:items-center sm:p-5" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-stone-900">记录这次跑步</h3>
            <p className="mt-0.5 text-xs text-stone-400">
              {session?.title || "自由跑"}{session?.km ? ` · 计划 ${session.km} km` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-stone-400 hover:text-stone-600">关闭</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <label className="text-[11px] text-stone-400">
            日期
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
            />
          </label>
          <label className="text-[11px] text-stone-400">
            距离 km
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="如 5.02"
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
            />
          </label>
          <label className="text-[11px] text-stone-400">
            用时 分钟
            <input
              type="number"
              inputMode="decimal"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="如 32"
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
            />
          </label>
          <div className="text-[11px] text-stone-400">
            体感 RPE {rpe}/5
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRpe(n)}
                  className={cn("h-8 flex-1 rounded-lg text-xs", rpe === n ? "text-white" : "bg-[#FAF9F7] text-stone-500")}
                  style={rpe === n ? { background: tint[2] } : undefined}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2.5">
          <div className="text-[11px] text-stone-400">跑完感觉</div>
          <div className="mt-1.5 flex gap-1.5">
            {["很好", "不错", "一般", "很累"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFeel(f)}
                className={cn("flex-1 rounded-full py-1.5 text-[11px]", feel === f ? "text-white" : "bg-[#FAF9F7] text-stone-500")}
                style={feel === f ? { background: tint[2] } : undefined}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2.5 flex gap-2.5">
          <input
            type="number"
            inputMode="numeric"
            value={avgHr}
            onChange={(e) => setAvgHr(e.target.value)}
            placeholder="平均心率"
            className="h-10 w-28 shrink-0 rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="想记一笔的话（可选）"
            className="h-10 min-w-0 flex-1 rounded-xl border border-stone-200 px-3 text-sm text-stone-800 outline-none focus:border-[#384877]"
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-stone-200 text-xs text-stone-600 disabled:opacity-50"
          >
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {parsing ? "正在识别…" : "识别运动截图"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => parseScreenshot(e.target.files?.[0])} />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-11 flex-1 rounded-full text-sm font-medium text-white disabled:opacity-50"
            style={{ background: tint[2] }}
          >
            {saving ? "保存中…" : "保存记录"}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-stone-400">
          截图只用于识别本次数据，原图不会公开展示。
        </p>
      </div>
    </div>
  );
}
