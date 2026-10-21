// 智能约定规划的个性化输入：从用户当前约定与历史行为里提炼排期参考。
// 只读、尽力而为：任何一步失败都降级为已收集到的部分，绝不让规划链路失败。
// 产出由 /api/chat 的 plan 意图注入规划器 prompt，用户明确偏好永远优先于这些数据。

const DAY_MS = 86400000;

// 把打卡行为的小时直方图聚合为最多 3 个「活跃时段」字符串，如 "7:00-9:00"
function hoursToWindows(hourCounts) {
  const entries = Object.entries(hourCounts).map(([h, c]) => [Number(h), c]);
  if (entries.length === 0) return [];
  const maxCount = Math.max(...entries.map(([, c]) => c));
  const active = new Set(entries.filter(([, c]) => c >= Math.max(1, maxCount * 0.3)).map(([h]) => h));
  const windows = [];
  let start = null;
  for (let h = 0; h <= 24; h += 1) {
    if (active.has(h) && start === null) start = h;
    if (!active.has(h) && start !== null) {
      windows.push({ start, end: h, count: 0 });
      start = null;
    }
  }
  for (const w of windows) {
    w.count = entries.filter(([h]) => h >= w.start && h < w.end).reduce((s, [, c]) => s + c, 0);
  }
  return windows
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .sort((a, b) => a.start - b.start)
    .map((w) => `${w.start}:00-${w.end}:00`);
}

export async function buildPlanInsights({ userId, prisma, busyTasks = [] } = {}) {
  if (!userId || !prisma) return null;
  const now = Date.now();
  const since90 = new Date(now - 90 * DAY_MS);
  const since30 = new Date(now - 30 * DAY_MS);

  const [behaviorRes, subtaskRes, checkinTaskRes, checkinHabitRes] = await Promise.allSettled([
    // 近 90 天打卡行为的小时分布 → 活跃时段
    prisma.userBehavior.findMany({
      where: { userId, eventType: "checkin_created", createdAt: { gte: since90 } },
      select: { hourOfDay: true },
      take: 2000,
    }),
    // 近 30 天创建的子约定完成率 → 近期执行力（过低则首周减量起步）
    (async () => {
      const children = await prisma.task.findMany({
        where: { userId, deletedAt: null, parentTaskId: { not: null }, createdAt: { gte: since30 } },
        select: { status: true },
        take: 500,
      });
      if (children.length < 3) return null;
      const done = children.filter((t) => t.status === "DONE").length;
      return Math.round((done / children.length) * 100) / 100;
    })(),
    // 进行中的开放式/窗口打卡约定：规划内容重合时排期要避开并引导联动打卡
    prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        category: "checkin",
        status: { notIn: ["DONE", "ARCHIVED"] },
      },
      select: { title: true, reminderTime: true },
      take: 50,
    }),
    // 近 30 天实际打卡最多的约定标题 → 真实习惯
    prisma.checkin.findMany({
      where: { userId, createdAt: { gte: since30 } },
      select: { task: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const hourCounts = {};
  if (behaviorRes.status === "fulfilled") {
    for (const b of behaviorRes.value) {
      if (Number.isInteger(b.hourOfDay)) hourCounts[b.hourOfDay] = (hourCounts[b.hourOfDay] || 0) + 1;
    }
  }
  const activeWindows = hoursToWindows(hourCounts);

  const existingCheckins = checkinTaskRes.status === "fulfilled"
    ? checkinTaskRes.value.map((t) => ({
        title: String(t.title || "").slice(0, 20),
        hour: t.reminderTime ? new Date(t.reminderTime.getTime() + 8 * 3600 * 1000).getUTCHours() : null,
      }))
    : [];

  const habitCounts = {};
  if (checkinHabitRes.status === "fulfilled") {
    for (const c of checkinHabitRes.value) {
      const title = String(c.task?.title || "").trim();
      if (title) habitCounts[title] = (habitCounts[title] || 0) + 1;
    }
  }
  const topHabitTitles = Object.entries(habitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  // 规划窗口内每日已被占用的分钟数（busyTasks 与注入规划器的 existing 同源）
  const perDayMinutes = {};
  for (const b of Array.isArray(busyTasks) ? busyTasks : []) {
    if (!b?.date || !b.start || !b.end) continue;
    const [sh, sm] = String(b.start).split(":").map(Number);
    const [eh, em] = String(b.end).split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (Number.isFinite(mins) && mins > 0) perDayMinutes[b.date] = (perDayMinutes[b.date] || 0) + mins;
  }
  const busyDays = Object.values(perDayMinutes);
  const avgDailyBusyMinutes = busyDays.length
    ? Math.round(busyDays.reduce((s, v) => s + v, 0) / busyDays.length)
    : 0;

  const subtaskDoneRate30d = subtaskRes.status === "fulfilled" ? subtaskRes.value : null;

  // 没有任何历史信号时不注入，避免在 prompt 里放一堆"无数据"
  if (activeWindows.length === 0 && existingCheckins.length === 0 && topHabitTitles.length === 0
    && subtaskDoneRate30d === null && avgDailyBusyMinutes === 0) {
    return null;
  }
  return {
    activeWindows,
    checkinCount90d: behaviorRes.status === "fulfilled" ? behaviorRes.value.length : 0,
    topHabitTitles,
    existingCheckins,
    subtaskDoneRate30d,
    avgDailyBusyMinutes,
  };
}

// 把 insights 对象渲染成注入规划 prompt 的文本段（无数据项不渲染；容忍部分字段缺失）
export function renderInsightsForPrompt(insights) {
  if (!insights) return "";
  const lines = [];
  if ((insights.activeWindows?.length ?? 0) > 0) {
    lines.push(`- 历史活跃时段（近90天打卡行为）：${insights.activeWindows.join("、")}`);
  }
  if (insights.subtaskDoneRate30d !== null && insights.subtaskDoneRate30d !== undefined) {
    lines.push(`- 近30天子约定完成率：${Math.round(insights.subtaskDoneRate30d * 100)}%（低于50%说明近期偏吃力）`);
  }
  if ((insights.topHabitTitles?.length ?? 0) > 0) {
    lines.push(`- 近30天打卡最多的约定：${insights.topHabitTitles.join("、")}`);
  }
  if ((insights.existingCheckins?.length ?? 0) > 0) {
    const desc = insights.existingCheckins
      .map((c) => (c.hour !== null && c.hour !== undefined ? `${c.title}（约${c.hour}点提醒）` : c.title))
      .join("、");
    lines.push(`- 进行中的打卡约定：${desc}——内容重合时排期避开其提醒时刻`);
  }
  if (insights.avgDailyBusyMinutes > 0) {
    lines.push(`- 规划窗口内平均每天已有占用：约${insights.avgDailyBusyMinutes}分钟`);
  }
  return lines.join("\n");
}
