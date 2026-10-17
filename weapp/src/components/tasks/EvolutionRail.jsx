import { View, Text } from "@tarojs/components";
import { IconSprout, IconClock3, IconTrendingUp, IconMoonStar, IconLock } from "./icons";
import theme from "./theme";

const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];

const AUTOMATION_LABELS = {
  email: "邮件草稿",
  research: "联网调研",
  slides: "演示稿",
  ledger: "整理账本",
  file: "文件整理",
  calendar: "日程同步",
  none: "自动执行",
};

function SectionLabel({ children }) {
  return (
    <View style={{ display: "flex", alignItems: "center", gap: "12rpx", marginBottom: "12rpx" }}>
      {children}
      <View style={{ flex: 1, height: "1rpx", background: theme.border }} />
    </View>
  );
}

function Bar({ value, max, color }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={{ flex: 1, height: "4rpx", background: theme.border, marginHorizontal: "12rpx" }}>
      <View style={{ width: `${width}%`, height: "100%", background: color || theme.primary }} />
    </View>
  );
}

export function computeEvolution(tasks, executions) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isDoneTask = (t) => ["completed", "done", "archived"].includes(String(t?.status || "").toLowerCase());

  const topTasks = (tasks || []).filter((t) => !t.parent_task_id);

  // 兑现事件 = 自动执行完成的单子 + 手动完成的约定，全部来自真实数据
  const events = [];
  for (const e of executions || []) {
    const st = String(e.execution_status || e.status || "").toLowerCase();
    if (st === "completed" || st === "done") {
      const at = e.completed_at || e.created_date;
      if (at) events.push({ at: new Date(at), taskId: e.task_id, exec: e });
    }
  }
  for (const t of tasks || []) {
    if (isDoneTask(t) && t.completed_at) {
      events.push({ at: new Date(t.completed_at), taskId: t.id, task: t });
    }
  }

  // streak
  const completedDays = new Set(events.map((ev) => startOfDay(ev.at).getTime()));
  const sortedDays = Array.from(completedDays).sort((a, b) => b - a);
  let streak = 0;
  if (sortedDays.length > 0) {
    const todayTime = startOfDay(now).getTime();
    const yesterdayTime = todayTime - 86400000;
    if (completedDays.has(todayTime) || completedDays.has(yesterdayTime)) {
      streak = 1;
      let check = completedDays.has(todayTime) ? todayTime : yesterdayTime;
      while (true) {
        const prev = check - 86400000;
        if (completedDays.has(prev)) {
          streak += 1;
          check = prev;
        } else {
          break;
        }
      }
    }
  }

  // today
  const doneToday = events.filter((ev) => isSameDay(ev.at, now)).length;
  const totalToday = topTasks.filter((t) => {
    const end = t.end_time || t.due_at || t.reminder_time;
    if (!end) return false;
    return isSameDay(new Date(end), now);
  }).length;

  // avgDelay / buffer：没有足够样本时返回 null，UI 如实提示
  let delays = [];
  for (const ev of events) {
    const task = ev.task || (tasks || []).find((t) => t.id === ev.taskId);
    if (!task) continue;
    const end = task.end_time || task.due_at;
    if (!end) continue;
    const diff = (ev.at.getTime() - new Date(end).getTime()) / 60000;
    if (diff > -1440 && diff < 1440) delays.push(diff);
  }
  const avgDelay = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;
  const buffer = avgDelay == null ? null : avgDelay > 0 ? Math.max(5, Math.round(avgDelay / 2)) : 15;

  // peak hours：无兑现数据返回 null，不编造
  const hourCounts = new Array(24).fill(0);
  for (const ev of events) {
    hourCounts[ev.at.getHours()] += 1;
  }
  let maxHour = 9;
  let maxHourCount = 0;
  hourCounts.forEach((c, i) => {
    if (c > maxHourCount) {
      maxHourCount = c;
      maxHour = i;
    }
  });
  const peakHours = maxHourCount > 0 ? `${maxHour}:00 – ${maxHour + 2}:00` : null;

  // peak days：无数据返回 null
  const dayCounts = new Array(7).fill(0);
  for (const ev of events) {
    dayCounts[ev.at.getDay() === 0 ? 6 : ev.at.getDay() - 1] += 1;
  }
  const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const peakDayIndices = dayCounts
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 2)
    .filter((x) => x.c > 0)
    .map((x) => dayNames[x.i]);
  const peakDays = peakDayIndices.length > 0 ? peakDayIndices.join(" / ") : null;

  // week bars
  const weekBars = dayCounts;

  // snooze reasons (no backend source; leave empty)
  const snoozeReasons = [];

  // automation trust from executions
  const autoCounts = {};
  for (const e of executions || []) {
    const type = e.automation_type || "none";
    if (!type || type === "none") continue;
    autoCounts[type] = (autoCounts[type] || 0) + 1;
  }
  const totalAuto = Object.values(autoCounts).reduce((a, b) => a + b, 0) || 1;
  const trust = Object.entries(autoCounts)
    .map(([kind, count]) => ({
      label: AUTOMATION_LABELS[kind] || kind,
      value: Math.round((count / totalAuto) * 100),
      mode: count > totalAuto * 0.5 ? "自动执行" : count > totalAuto * 0.25 ? "确认后执行" : "人工接管",
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    streak,
    doneToday,
    totalToday,
    avgDelay,
    buffer,
    peakDays,
    peakHours,
    weekBars,
    snoozeReasons,
    trust,
    totalTasks: topTasks.length,
  };
}

export default function EvolutionRail({ evo, onReview }) {
  const maxBar = Math.max(...(evo.weekBars || [1]), 1);
  const maxSnooze = Math.max(...(evo.snoozeReasons || []).map((r) => r.count), 1);

  return (
    <View
      style={{
        border: `1rpx solid ${theme.border}`,
        background: "rgba(91, 130, 160, 0.10)",
        borderRadius: "16rpx",
        overflow: "hidden",
        marginTop: "40rpx",
      }}
    >
      <View
        style={{
          borderBottom: `1rpx solid ${theme.border}`,
          padding: "28rpx",
        }}
      >
        <View style={{ display: "flex", alignItems: "center", gap: "12rpx" }}>
          <IconSprout size={34} color={theme.primary} />
          <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme.primary }}>心栈越来越懂你</Text>
        </View>
        <Text style={{ marginTop: "10rpx", fontSize: "22rpx", color: theme.inkTertiary, letterSpacing: "2rpx" }}>
          基于 {evo.totalTasks} 条约定与生活记录 · 每日进化
        </Text>
      </View>

      <View style={{ padding: "28rpx" }}>
        {/* streak */}
        <View style={{ marginBottom: "36rpx" }}>
          <SectionLabel>
            <Text style={{ fontSize: "20rpx", color: theme.inkTertiary, letterSpacing: "4rpx" }}>连续如约</Text>
          </SectionLabel>
          <View style={{ display: "flex", alignItems: "baseline", gap: "12rpx" }}>
            <Text style={{ fontSize: "72rpx", fontWeight: 600, color: theme.primary, lineHeight: "80rpx" }}>{evo.streak}</Text>
            <Text style={{ fontSize: "28rpx", color: theme.inkSecondary }}>天</Text>
            <Text style={{ marginLeft: "auto", fontSize: "22rpx", color: theme.inkTertiary }}>
              今日 {evo.doneToday}/{evo.totalToday} 已兑现
            </Text>
          </View>
        </View>

        {/* time calibration */}
        <View style={{ marginBottom: "36rpx" }}>
          <SectionLabel>
            <IconClock3 size={22} color={theme.water} />
            <Text style={{ fontSize: "20rpx", color: theme.inkTertiary, letterSpacing: "4rpx" }}>时间校准</Text>
          </SectionLabel>
          <Text style={{ fontSize: "26rpx", color: theme.inkSecondary, lineHeight: "42rpx" }}>
            {evo.avgDelay == null ? (
              "完成数据还少，心栈还在观察你的节奏——多兑现几条约定，这里会给出真实的时间校准。"
            ) : (
              <>
                你的约定平均晚 <Text style={{ fontWeight: 700, color: theme.primary }}>{evo.avgDelay} 分钟</Text> 完成，
                心栈已自动为每个约定预留 <Text style={{ fontWeight: 700, color: theme.seal }}>+{evo.buffer} 分钟</Text> 缓冲。
              </>
            )}
          </Text>
          {evo.avgDelay != null && (
            <>
              <View style={{ marginTop: "16rpx", height: "4rpx", width: "100%", background: theme.border }}>
                <View style={{ width: `${Math.min(100, evo.buffer * 4)}%`, height: "100%", background: theme.water }} />
              </View>
              <Text style={{ marginTop: "8rpx", fontSize: "20rpx", color: theme.inkTertiary }}>缓冲准确率随数据量持续提升</Text>
            </>
          )}
        </View>

        {/* peak rhythm */}
        <View style={{ marginBottom: "36rpx" }}>
          <SectionLabel>
            <IconTrendingUp size={22} color={theme.water} />
            <Text style={{ fontSize: "20rpx", color: theme.inkTertiary, letterSpacing: "4rpx" }}>能量节律</Text>
          </SectionLabel>
          <Text style={{ fontSize: "26rpx", color: theme.inkSecondary }}>
            {evo.peakDays ? (
              <>
                <Text style={{ fontWeight: 700, color: theme.primary }}>{evo.peakDays}</Text> {evo.peakHours} 是你的高产窗口
              </>
            ) : (
              "继续兑现约定，心栈会找到你的高产窗口。"
            )}
          </Text>
          <View style={{ marginTop: "16rpx", display: "flex", alignItems: "flex-end", gap: "12rpx", height: "120rpx" }}>
            {(evo.weekBars || [0, 0, 0, 0, 0, 0, 0]).map((v, i) => (
              <View key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8rpx" }}>
                <View
                  style={{
                    width: "100%",
                    height: `${(v / maxBar) * 100 + 6}rpx`,
                    background: v === maxBar && maxBar > 0 ? theme.primary : theme.waterLight,
                    minHeight: "6rpx",
                    borderRadius: "2rpx",
                  }}
                />
                <Text style={{ fontSize: "18rpx", color: theme.inkTertiary }}>{weekLabels[i]}</Text>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: "8rpx", fontSize: "20rpx", color: theme.inkTertiary }}>重要约定将优先排进高产窗口</Text>
        </View>

        {/* snooze reasons */}
        {evo.snoozeReasons && evo.snoozeReasons.length > 0 && (
          <View style={{ marginBottom: "36rpx" }}>
            <SectionLabel>
              <IconMoonStar size={22} color={theme.water} />
              <Text style={{ fontSize: "20rpx", color: theme.inkTertiary, letterSpacing: "4rpx" }}>顺延原因</Text>
            </SectionLabel>
            {(evo.snoozeReasons || []).map((r) => (
              <View key={r.label} style={{ display: "flex", alignItems: "center", gap: "12rpx", marginBottom: "12rpx" }}>
                <Text style={{ width: "120rpx", fontSize: "24rpx", color: theme.inkSecondary, flexShrink: 0 }}>{r.label}</Text>
                <Bar value={r.count} max={maxSnooze} />
                <Text style={{ width: "48rpx", textAlign: "right", fontSize: "22rpx", color: theme.inkTertiary }}>{r.count}次</Text>
              </View>
            ))}
            <Text style={{ marginTop: "10rpx", fontSize: "20rpx", color: theme.inkTertiary, lineHeight: "32rpx" }}>
              「{evo.snoozeReasons[0]?.label}」最多 —— 心栈已把晚间约定改排到清晨。
            </Text>
          </View>
        )}

        {/* automation trust */}
        <View style={{ marginBottom: "28rpx" }}>
          <SectionLabel>
            <IconSprout size={22} color={theme.water} />
            <Text style={{ fontSize: "20rpx", color: theme.inkTertiary, letterSpacing: "4rpx" }}>自动化信任度</Text>
          </SectionLabel>
          {evo.trust && evo.trust.length > 0 ? (
            evo.trust.map((t) => (
              <View key={t.label} style={{ marginBottom: "18rpx" }}>
                <View style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Text style={{ fontSize: "25rpx", color: theme.inkSecondary }}>{t.label}</Text>
                  <Text style={{ fontSize: "20rpx", color: theme.inkTertiary }}>{t.mode} · {t.value}%</Text>
                </View>
                <View style={{ marginTop: "10rpx", height: "4rpx", width: "100%", background: theme.border }}>
                  <View style={{ width: `${t.value}%`, height: "100%", background: t.value >= 90 ? theme.seal : theme.water }} />
                </View>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: "24rpx", color: theme.inkTertiary }}>暂无自动化执行记录</Text>
          )}
          <Text style={{ marginTop: "12rpx", fontSize: "20rpx", color: theme.inkTertiary, lineHeight: "32rpx" }}>
            信任度 ≥90% 后自动执行，低于 50% 转人工接管 —— 由你的每次评价决定。
          </Text>
        </View>

        {/* review entry */}
        <View
          onClick={onReview}
          style={{
            background: theme.primary,
            padding: "28rpx",
            borderRadius: "8rpx",
          }}
        >
          <Text style={{ fontSize: "20rpx", color: "rgba(250,251,251,0.7)", letterSpacing: "4rpx" }}>晚间仪式 · 60 秒</Text>
          <Text style={{ marginTop: "8rpx", fontSize: "32rpx", fontWeight: 700, color: theme.paper }}>开始今日复盘 →</Text>
        </View>

        <View
          style={{
            marginTop: "24rpx",
            borderTop: `1rpx dashed ${theme.border}`,
            paddingTop: "20rpx",
            display: "flex",
            alignItems: "flex-start",
            gap: "10rpx",
          }}
        >
          <IconLock size={22} color={theme.inkTertiary} />
          <Text style={{ flex: 1, fontSize: "20rpx", color: theme.inkTertiary, lineHeight: "32rpx" }}>
            这些记忆只属于你：可查看、可导出、可删除。
          </Text>
        </View>
      </View>
    </View>
  );
}
