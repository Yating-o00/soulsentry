import { prisma } from "./prisma.js";

/**
 * 行为埋点：写入 UserBehavior，供 admin 数据看板（留存/活跃/功能使用）消费。
 * 永不抛出——埋点失败绝不影响主流程。
 */
export async function logBehavior(userId, eventType, data = {}) {
  if (!userId) return;
  try {
    const now = new Date();
    await prisma.userBehavior.create({
      data: {
        userId,
        eventType,
        taskId: data.taskId || null,
        category: data.category || null,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
        metadata: data.metadata || undefined,
      },
    });
  } catch (e) {
    console.warn(`[behavior] ${eventType} failed:`, e?.message || e);
  }
}

// 北京时区当日日期串（与 reminderSender / StatsDaily 口径一致）
export function beijingToday(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

// 北京日期串 -> UTC 时间范围 [start, end)
export function beijingDayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+08:00`);
  return [start, new Date(start.getTime() + 24 * 3600 * 1000)];
}
