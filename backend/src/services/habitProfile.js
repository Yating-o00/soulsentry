import { extractLocation } from "./extractContext.js";

const PROFILE_SAMPLE_SIZE = 50;
const PROFILE_WINDOW_DAYS = 90;
const MIN_SAMPLES = 3;

// 轻量记忆画像：纯统计用户最近完成任务的习惯，作为解析 prompt 的参考上下文。
// 样本不足返回 null；零 AI 调用。
export async function getUserHabitProfile(userId, prisma) {
  try {
    if (!userId || !prisma) return null;

    const since = new Date();
    since.setDate(since.getDate() - PROFILE_WINDOW_DAYS);

    const completed = await prisma.task.findMany({
      where: {
        userId,
        completedAt: { not: null, gte: since },
        status: { in: ["completed", "done"] },
      },
      select: {
        completedAt: true,
        tags: true,
        description: true,
      },
      orderBy: { completedAt: "desc" },
      take: PROFILE_SAMPLE_SIZE,
    });

    if (!Array.isArray(completed) || completed.length < MIN_SAMPLES) return null;

    // 完成时段分布
    const slotCount = { 上午: 0, 下午: 0, 晚上: 0 };
    for (const t of completed) {
      const h = new Date(t.completedAt).getHours();
      if (h >= 5 && h < 12) slotCount.上午 += 1;
      else if (h >= 12 && h < 18) slotCount.下午 += 1;
      else slotCount.晚上 += 1;
    }
    const topSlots = Object.entries(slotCount)
      .sort((a, b) => b[1] - a[1])
      .filter(([, n]) => n > 0)
      .slice(0, 2)
      .map(([slot]) => slot);

    // 常用联系人（@人名 tags）
    const peopleCount = new Map();
    for (const t of completed) {
      for (const tag of t.tags || []) {
        const s = String(tag || "");
        if (s.startsWith("@")) {
          const name = s.slice(1).trim();
          if (name) peopleCount.set(name, (peopleCount.get(name) || 0) + 1);
        }
      }
    }
    const topPeople = [...peopleCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => `@${name}`);

    // 常去地点（从描述里提取地点词）
    const locationCount = new Map();
    for (const t of completed) {
      const loc = extractLocation(t.description || "", []);
      if (loc?.name) {
        locationCount.set(loc.name, (locationCount.get(loc.name) || 0) + 1);
      }
    }
    const topLocations = [...locationCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    const parts = [];
    if (topSlots.length > 0) parts.push(`常在${topSlots.join("、")}完成约定（${completed.length} 条样本）`);
    if (topPeople.length > 0) parts.push(`常联系的联系人：${topPeople.join("、")}`);
    if (topLocations.length > 0) parts.push(`常出现的地点：${topLocations.join("、")}`);

    return parts.length > 0 ? parts.join("；") : null;
  } catch (err) {
    console.error("[habitProfile] 画像统计失败:", err?.message || err);
    return null;
  }
}
