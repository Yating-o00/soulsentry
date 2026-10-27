import { schedule } from "node-cron";
import { prisma } from "../lib/prisma.js";
import { beijingToday, beijingDayRange } from "../lib/behavior.js";

/**
 * 日汇总：把当天原始数据滚成 StatsDaily 一行（admin 看板的历史数据来源）。
 * 口径：北京自然日。当天数据由 admin 接口实时直查（computeDayStats），
 * 昨天及更早由本服务写入，避免看板扫原始大表。
 */

// 计算某个北京日的全部指标（不读写 StatsDaily）
export async function computeDayStats(dateStr) {
  const [start, end] = beijingDayRange(dateStr);
  const day = { gte: start, lt: end };

  const [
    newUsers,
    totalUsers,
    activeRows,
    checkins,
    cheers,
    commentsTask,
    commentsNote,
    tasksCreated,
    tasksCompleted,
    shareVisitorRows,
    joins,
    createdTasks,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: day } }),
    prisma.user.count({ where: { createdAt: { lt: end } } }),
    prisma.userBehavior.findMany({ where: { createdAt: day }, select: { userId: true }, distinct: ["userId"] }),
    prisma.checkin.count({ where: { createdAt: day } }),
    prisma.cheer.count({ where: { createdAt: day } }),
    prisma.comment.count({ where: { createdAt: day } }),
    prisma.noteComment.count({ where: { createdAt: day } }),
    prisma.task.count({ where: { createdAt: day, parentTaskId: null } }),
    // 顶层非打卡约定完成数（打卡约定的每日勾选由 checkins 口径承担）
    prisma.task.count({ where: { completedAt: day, parentTaskId: null, category: { not: "checkin" } } }),
    prisma.sharedActionLog.findMany({ where: { createdAt: day }, select: { visitorToken: true }, distinct: ["visitorToken"] }),
    prisma.taskMember.count({ where: { createdAt: day } }),
    // SQLite 的 Prisma Json 不支持 contains 过滤，拉当天新建任务在 JS 侧筛 plan 子约定（量小）
    prisma.task.findMany({ where: { createdAt: day }, select: { metadata: true } }),
  ]);

  const eventGroups = await prisma.userBehavior.groupBy({
    by: ["eventType"],
    where: { createdAt: day },
    _count: true,
  });

  const planChildren = createdTasks.filter((t) =>
    JSON.stringify(t.metadata || {}).includes('"plan_kind"')
  ).length;

  return {
    date: dateStr,
    newUsers,
    totalUsers,
    activeUsers: activeRows.length,
    checkins,
    cheers,
    comments: commentsTask + commentsNote,
    tasksCreated,
    tasksCompleted,
    shareVisitors: shareVisitorRows.length,
    joins,
    planChildren,
    events: Object.fromEntries(eventGroups.map((g) => [g.eventType, g._count])),
  };
}

// 汇总某天并写入 StatsDaily（已存在则覆盖，保证重跑幂等）
export async function rollupDay(dateStr) {
  const stats = await computeDayStats(dateStr);
  const { date, events, ...fields } = stats;
  await prisma.statsDaily.upsert({
    where: { date },
    create: { date, events, ...fields },
    update: { events, ...fields },
  });
  return stats;
}

// 启动回补：从最早数据日起补到昨天，只补缺失的日期
async function backfillMissingDays() {
  const [firstUser, firstBehavior] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.userBehavior.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const earliest = [firstUser?.createdAt, firstBehavior?.createdAt]
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  if (!earliest) return;

  const startDate = new Date(earliest.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const yesterday = beijingToday(-1);
  const existing = new Set(
    (await prisma.statsDaily.findMany({ select: { date: true } })).map((r) => r.date)
  );

  for (let d = startDate; d <= yesterday; d = beijingNext(d)) {
    if (existing.has(d)) continue;
    try {
      await rollupDay(d);
      console.log(`[statsRollup] backfilled ${d}`);
    } catch (e) {
      console.error(`[statsRollup] backfill ${d} failed:`, e?.message || e);
    }
  }
}

function beijingNext(dateStr) {
  return new Date(new Date(`${dateStr}T00:00:00+08:00`).getTime() + 86400000 + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

let started = false;

export function startStatsCron() {
  if (started) return;
  started = true;

  // 每天 03:07 汇总昨天（北京时间，服务器本地时区即 CST）
  schedule("7 3 * * *", async () => {
    try {
      await rollupDay(beijingToday(-1));
    } catch (e) {
      console.error("[statsRollup] daily rollup failed:", e?.message || e);
    }
  });

  // 启动 15s 后异步回补缺失日期，不阻塞服务就绪
  setTimeout(() => {
    backfillMissingDays().catch((e) => console.error("[statsRollup] backfill failed:", e?.message || e));
  }, 15000);
}
