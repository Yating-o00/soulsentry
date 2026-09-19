import { prisma } from "../lib/prisma.js";
import { trySendPush } from "./reminderSender.js";

// 地点类型 → 相关约定分类（与 getSentinelGuard 保持一致）
const CATEGORY_MAP = {
  office: ["work"],
  home: ["personal", "family", "health"],
  gym: ["health"],
  school: ["study"],
  shopping: ["shopping"],
  hospital: ["health"],
  restaurant: ["personal"]
};

const PRIORITY_SCORE = { urgent: 40, high: 30, medium: 18, low: 8 };

// POI 触发规则：POI 命中关键词 → 匹配约定关键词（取快递场景等）
const POI_RULES = [
  {
    key: "parcel_locker",
    poi_keywords: ["快递柜", "快递", "驿站", "自提点", "丰巢", "菜鸟"],
    task_keywords: ["快递", "取件", "包裹", "自提"],
    poi_label: "快递柜"
  }
];

function getTaskExtraFields(task) {
  if (task?.metadata && typeof task.metadata === "object") {
    return task.metadata._extraFields || {};
  }
  return {};
}

function getTaskLocationReminder(task) {
  return getTaskExtraFields(task).location_reminder || null;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// 重要性（优先级）+ 紧迫度（截止时间/提醒时间）+ 难易度（低难度更易完成，加权鼓励推进）
function scoreTask(task, now, todayStart, todayEnd) {
  let score = PRIORITY_SCORE[String(task.priority || "medium").toLowerCase()] ?? 18;

  if (task.dueAt) {
    if (task.dueAt < now) score += 25; // 已过期
    else if (task.dueAt <= todayEnd) score += 15; // 今天到期
    else score += 5;
  }
  if (task.reminderTime) {
    const rt = new Date(task.reminderTime);
    if (rt >= todayStart && rt <= todayEnd) score += 8;
    if (rt < now) score += 6;
  }
  const extra = getTaskExtraFields(task);
  const difficulty = String(extra.difficulty || task.metadata?.difficulty || "").toLowerCase();
  if (difficulty === "easy" || difficulty === "low") score += 4;
  if (difficulty === "hard" || difficulty === "high") score -= 2;

  return score;
}

// 过滤父约定已关闭（删除/完成）的子约定
async function filterAliveParents(tasks) {
  const parentIds = [...new Set(tasks.map((t) => t.parentTaskId).filter(Boolean))];
  if (parentIds.length === 0) return tasks;
  const parents = await prisma.task.findMany({ where: { id: { in: parentIds } } });
  const alive = new Set(
    parents.filter((p) => !p.deletedAt && p.status !== "DONE" && p.status !== "ARCHIVED").map((p) => p.id)
  );
  return tasks.filter((t) => !t.parentTaskId || alive.has(t.parentTaskId));
}

/**
 * 到达地点后的 Top-N 相关约定：
 * - 绑定了该地点（location_reminder 坐标/名称命中）的约定
 * - 分类与地点类型相关的约定（办公场所→work 等）
 * 按 重要性/紧迫度/难易度 打分排序取前 n。
 */
export async function rankTopTasksForLocation(userId, location, n = 3) {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  const active = await prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      status: { in: ["TODO", "IN_PROGRESS"] }
    },
    take: 100
  });
  const alive = await filterAliveParents(active);

  const relatedCategories = CATEGORY_MAP[location.locationType] || [];
  const locationCoords = { latitude: location.latitude, longitude: location.longitude };

  const scored = alive
    .map((task) => {
      const reminder = getTaskLocationReminder(task);
      let linked = false;
      if (reminder?.enabled) {
        if (reminder.location_name && reminder.location_name === location.name) linked = true;
        if (typeof reminder.latitude === "number" && typeof reminder.longitude === "number") {
          const d = haversineMeters(locationCoords, { latitude: reminder.latitude, longitude: reminder.longitude });
          if (d <= Math.max(Number(reminder.radius || 200), location.radius)) linked = true;
        }
      }
      const categoryHit = task.category && relatedCategories.includes(task.category);
      if (!linked && !categoryHit) return null;
      return { task, score: scoreTask(task, now, todayStart, todayEnd) + (linked ? 10 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, n).map((s) => s.task);
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * 到达地点：安静期（quietMinutes 内不重复）内跳过；否则推送 Top3 并更新 lastEnteredAt。
 * 返回 { pushed: boolean, topTasks, skippedReason? }
 */
export async function maybeSendArrivalReminder(user, location, topTasks) {
  const now = new Date();
  const quietMs = (location.quietMinutes ?? 30) * 60 * 1000;
  const lastEnter = location.lastEnteredAt ? new Date(location.lastEnteredAt) : null;
  if (lastEnter && !isNaN(lastEnter.getTime()) && now.getTime() - lastEnter.getTime() < quietMs) {
    return { pushed: false, topTasks, skippedReason: "quiet_period" };
  }

  // 更新进入时间（无论是否有相关约定，都记录本次到达，安静期以此为锚）
  await prisma.savedLocation.update({
    where: { id: location.id },
    data: { lastEnteredAt: now }
  }).catch(() => {});

  if (!topTasks.length) {
    return { pushed: false, topTasks: [], skippedReason: "no_related_tasks" };
  }

  const listText = topTasks.map((t, i) => `${i + 1}. ${t.title}`).join("　");
  const payload = {
    title: `到了${location.name}，最值得处理的 ${topTasks.length} 件事`,
    body: listText,
    url: "/tasks",
    tag: `arrival-${location.id}`,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { type: "arrival_reminder", location_id: location.id }
  };

  const result = await trySendPush({
    userId: user.id,
    preferences: user.preferences,
    payload,
    task: topTasks[0],
    logPrefix: `arrival-reminder location=${location.id}`
  });

  return { pushed: result.ok, topTasks, inAppFallback: result.inAppFallback, skippedReason: result.ok ? null : "send_failed" };
}

function getPreferenceExtraFields(preferences) {
  if (preferences?.metadata && typeof preferences.metadata === "object") {
    return preferences.metadata._extraFields || {};
  }
  return {};
}

/**
 * POI 情境提醒（如快递柜）：
 * 按规则匹配约定关键词，命中则推送；每个规则 4 小时冷却（记录在 userPreference.metadata）。
 */
export async function maybeSendPoiReminder(user, { poiName, poiType }) {
  const text = `${poiType || ""} ${poiName || ""}`;
  const now = new Date();
  const COOLDOWN_MS = 4 * 60 * 60 * 1000;

  let preferences = user.preferences;
  const extra = getPreferenceExtraFields(preferences);
  const cooldowns = extra.poi_cooldowns || {};

  for (const rule of POI_RULES) {
    const poiHit = rule.poi_keywords.some((k) => text.includes(k));
    if (!poiHit) continue;
    const lastAt = cooldowns[rule.key] ? new Date(cooldowns[rule.key]) : null;
    if (lastAt && !isNaN(lastAt.getTime()) && now.getTime() - lastAt.getTime() < COOLDOWN_MS) {
      continue;
    }

    const active = await prisma.task.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        status: { in: ["TODO", "IN_PROGRESS"] }
      },
      take: 100
    });
    const alive = await filterAliveParents(active);
    const matched = alive.filter((t) =>
      rule.task_keywords.some((k) => (t.title || "").includes(k) || (t.description || "").includes(k))
    );
    if (!matched.length) continue;

    const listText = matched.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`).join("　");
    const payload = {
      title: `附近有${rule.poi_label}，有 ${matched.length} 个约定可以顺手处理`,
      body: listText,
      url: "/tasks",
      tag: `poi-${rule.key}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { type: "poi_reminder", rule: rule.key }
    };

    await trySendPush({
      userId: user.id,
      preferences,
      payload,
      task: matched[0],
      logPrefix: `poi-reminder rule=${rule.key}`
    });

    // 记录冷却时间
    try {
      const metadata = {
        ...(preferences?.metadata && typeof preferences.metadata === "object" ? preferences.metadata : {}),
        _extraFields: { ...extra, poi_cooldowns: { ...cooldowns, [rule.key]: now.toISOString() } }
      };
      preferences = await prisma.userPreference.upsert({
        where: { userId: user.id },
        update: { metadata },
        create: { userId: user.id, locale: "zh-CN", timezone: "Asia/Shanghai", metadata }
      });
    } catch (e) {
      console.warn("[contextReminder] failed to save poi cooldown:", e?.message || e);
    }

    return { pushed: true, rule: rule.key, matched: matched.length };
  }

  return { pushed: false };
}
