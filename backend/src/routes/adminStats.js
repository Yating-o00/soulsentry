import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { beijingToday, beijingDayRange } from "../lib/behavior.js";
import { computeDayStats } from "../services/statsRollup.js";

/**
 * Admin 数据看板接口：跨用户聚合，仅 ADMIN 角色可用。
 * 历史数据读 StatsDaily（rollup 每日写入），当天数据实时直查，保证看板"准实时"。
 */

export const adminStatsRouter = Router();

adminStatsRouter.use(requireAuth, (req, res, next) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "FORBIDDEN", message: "需要管理员权限" });
  }
  next();
});

// 活跃用户数：最近 N 天有任意行为事件的去重用户数
async function activeUsersSince(dateStr) {
  const [start] = beijingDayRange(dateStr);
  const rows = await prisma.userBehavior.findMany({
    where: { createdAt: { gte: start } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

const ZERO_DAY = {
  newUsers: 0, totalUsers: 0, activeUsers: 0, checkins: 0, cheers: 0, comments: 0,
  tasksCreated: 0, tasksCompleted: 0, shareVisitors: 0, joins: 0, planChildren: 0,
};

// GET /api/admin/stats/overview - 头部卡片：今天实况 + 昨天 + 周/月活跃
adminStatsRouter.get("/overview", async (_req, res) => {
  try {
    const today = beijingToday();
    const [todayStats, yesterday, wau, mau] = await Promise.all([
      computeDayStats(today),
      prisma.statsDaily.findUnique({ where: { date: beijingToday(-1) } }),
      activeUsersSince(beijingToday(-6)),
      activeUsersSince(beijingToday(-29)),
    ]);
    return res.json({
      today: todayStats,
      yesterday: yesterday || { date: beijingToday(-1), ...ZERO_DAY },
      totals: {
        totalUsers: todayStats.totalUsers,
        wau,
        mau,
      },
    });
  } catch (e) {
    console.error("[adminStats] overview failed:", e?.message || e);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// GET /api/admin/stats/trend?days=30 - 近 N 天序列（历史来自 StatsDaily，当天实时，缺失补零）
adminStatsRouter.get("/trend", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
    const today = beijingToday();
    const since = beijingToday(-(days - 1));
    const rows = await prisma.statsDaily.findMany({
      where: { date: { gte: since, lt: today } },
      orderBy: { date: "asc" },
    });
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const todayStats = await computeDayStats(today);

    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = beijingToday(-i);
      if (d === today) {
        series.push({ ...todayStats });
      } else {
        const r = byDate.get(d);
        series.push(r
          ? { date: r.date, newUsers: r.newUsers, activeUsers: r.activeUsers, checkins: r.checkins, cheers: r.cheers, comments: r.comments, tasksCompleted: r.tasksCompleted, shareVisitors: r.shareVisitors }
          : { date: d, ...ZERO_DAY });
      }
    }
    return res.json({ days: series });
  } catch (e) {
    console.error("[adminStats] trend failed:", e?.message || e);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// GET /api/admin/stats/retention?weeks=8 - 新增留存 cohort：按注册北京日分组，看第 1/3/7 天活跃率
adminStatsRouter.get("/retention", async (req, res) => {
  try {
    const weeks = Math.min(Math.max(Number(req.query.weeks) || 8, 2), 12);
    const span = weeks * 7;
    const since = beijingToday(-(span - 1));
    const [sinceStart] = beijingDayRange(since);

    const users = await prisma.user.findMany({
      where: { createdAt: { gte: sinceStart } },
      select: { id: true, createdAt: true },
    });
    if (users.length === 0) return res.json({ cohorts: [] });

    const userIds = users.map((u) => u.id);
    const behaviors = await prisma.userBehavior.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: sinceStart } },
      select: { userId: true, createdAt: true },
    });
    const activeMap = new Map();
    for (const b of behaviors) {
      const day = new Date(b.createdAt.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      if (!activeMap.has(b.userId)) activeMap.set(b.userId, new Set());
      activeMap.get(b.userId).add(day);
    }

    const cohorts = new Map();
    for (const u of users) {
      const d = new Date(u.createdAt.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      if (!cohorts.has(d)) cohorts.set(d, []);
      cohorts.get(d).push(u.id);
    }

    const shift = (dateStr, n) =>
      new Date(new Date(`${dateStr}T00:00:00+08:00`).getTime() + n * 86400000 + 8 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
    const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);

    const result = [...cohorts.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, ids]) => {
        const activeAt = (n) => ids.filter((id) => activeMap.get(id)?.has(shift(date, n))).length;
        return {
          date,
          users: ids.length,
          d1: pct(activeAt(1), ids.length),
          d3: pct(activeAt(3), ids.length),
          d7: pct(activeAt(7), ids.length),
        };
      });
    return res.json({ cohorts: result });
  } catch (e) {
    console.error("[adminStats] retention failed:", e?.message || e);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// GET /api/admin/stats/features?days=14 - 功能使用：事件分布 + 活跃时段 + 源表计数
adminStatsRouter.get("/features", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 30);
    const since = beijingToday(-(days - 1));
    const [start] = beijingDayRange(since);

    const [eventGroups, hourlyGroups, checkins, cheers, commentsTask, commentsNote, joins, createdTasks] = await Promise.all([
      prisma.userBehavior.groupBy({ by: ["eventType"], where: { createdAt: { gte: start } }, _count: true }),
      prisma.userBehavior.groupBy({ by: ["hourOfDay"], where: { createdAt: { gte: start } }, _count: true }),
      prisma.checkin.count({ where: { createdAt: { gte: start } } }),
      prisma.cheer.count({ where: { createdAt: { gte: start } } }),
      prisma.comment.count({ where: { createdAt: { gte: start } } }),
      prisma.noteComment.count({ where: { createdAt: { gte: start } } }),
      prisma.taskMember.count({ where: { createdAt: { gte: start } } }),
      prisma.task.findMany({ where: { createdAt: { gte: start } }, select: { metadata: true } }),
    ]);

    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourlyGroups.find((g) => g.hourOfDay === h)?._count || 0,
    }));

    return res.json({
      events: eventGroups
        .map((g) => ({ event_type: g.eventType, count: g._count }))
        .sort((a, b) => b.count - a.count),
      hourly,
      sources: {
        checkins,
        cheers,
        comments: commentsTask + commentsNote,
        joins,
        planChildren: createdTasks.filter((t) => JSON.stringify(t.metadata || {}).includes('"plan_kind"')).length,
      },
    });
  } catch (e) {
    console.error("[adminStats] features failed:", e?.message || e);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// GET /api/admin/stats/funnel - 两条漏斗：激活（注册→建约定→打卡）与分享裂变（互动访客→加油/评论/加入）
adminStatsRouter.get("/funnel", async (_req, res) => {
  try {
    const since = beijingToday(-13);
    const [start] = beijingDayRange(since);

    const [totalUsers, taskUserRows, checkinUserRows, shareVisitorRows, cheers, commentsTask, commentsNote, joins] =
      await Promise.all([
        prisma.user.count(),
        prisma.task.findMany({ where: { parentTaskId: null, deletedAt: null }, select: { userId: true }, distinct: ["userId"] }),
        prisma.checkin.findMany({ select: { userId: true }, distinct: ["userId"] }),
        prisma.sharedActionLog.findMany({ where: { createdAt: { gte: start } }, select: { visitorToken: true }, distinct: ["visitorToken"] }),
        prisma.cheer.count({ where: { createdAt: { gte: start } } }),
        prisma.comment.count({ where: { createdAt: { gte: start } } }),
        prisma.noteComment.count({ where: { createdAt: { gte: start } } }),
        prisma.taskMember.count({ where: { createdAt: { gte: start } } }),
      ]);

    const withTask = taskUserRows.length;
    const withCheckin = checkinUserRows.length;
    const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);

    return res.json({
      activation: {
        registered: totalUsers,
        withTask,
        withCheckin,
        taskConversion: pct(withTask, totalUsers),
        checkinConversion: pct(withCheckin, totalUsers),
      },
      share: {
        days: 14,
        visitors: shareVisitorRows.length,
        cheers,
        comments: commentsTask + commentsNote,
        joins,
      },
    });
  } catch (e) {
    console.error("[adminStats] funnel failed:", e?.message || e);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});
