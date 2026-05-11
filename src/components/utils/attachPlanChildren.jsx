import { base44 } from "@/api/base44Client";

/**
 * 把 analyzeIntent 返回的「情境感知时间线」与「自动执行清单」作为子约定，
 * 挂到 extractAndCreateTasks 创建的父约定下。
 *
 * - timeline 项 → 带 ⏱ 情境时间 备注的子约定
 * - automations 项 → 带 ⚙️ 自动执行 备注的子约定
 *
 * 仅当父约定存在且没有同名子约定时才创建,避免重复。
 */
export async function attachPlanChildrenToParent(parentTaskId, { timeline = [], automations = [], dateStr } = {}) {
  if (!parentTaskId) return 0;

  // 拉取已有子约定,做标题 + 同分钟级时间双重去重
  const normTitle = (s) => (s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\p{P}🎯⏱⚙️✨]+/gu, "");
  const existingChildTitles = new Set();
  const existingTimeKeys = new Set(); // `${normTitle}@${YYYY-MM-DDTHH:MM}` 避免同标题同分钟重复
  try {
    const existing = await base44.entities.Task.filter({ parent_task_id: parentTaskId });
    existing.forEach(t => {
      if (!t || t.deleted_at) return;
      const nt = normTitle(t.title);
      if (nt) existingChildTitles.add(nt);
      if (nt && t.reminder_time) {
        const d = new Date(t.reminder_time);
        if (!isNaN(d.getTime())) {
          const key = `${nt}@${d.toISOString().slice(0, 16)}`;
          existingTimeKeys.add(key);
        }
      }
    });
  } catch (_) { /* ignore */ }

  // 取父约定基础属性(继承 category/priority)
  let parentInfo = null;
  try {
    parentInfo = await base44.entities.Task.get(parentTaskId);
  } catch (_) { /* ignore */ }
  const baseCategory = parentInfo?.category || "personal";
  const basePriority = parentInfo?.priority || "medium";

  const isoFromTimeStr = (timeStr) => {
    if (!timeStr || !dateStr) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
    if (!m) return null;
    const hh = String(m[1]).padStart(2, "0");
    return `${dateStr}T${hh}:${m[2]}:00+08:00`;
  };

  const payloads = [];

  // 时间线 → 子约定
  (timeline || []).forEach(item => {
    const title = (item?.title || "").trim();
    if (!title) return;
    const nt = normTitle(title);
    if (existingChildTitles.has(nt)) return;
    const iso = isoFromTimeStr(item.time);
    const timeKey = iso ? `${nt}@${new Date(iso).toISOString().slice(0, 16)}` : null;
    if (timeKey && existingTimeKeys.has(timeKey)) return;

    const parts = [];
    if (item.description) parts.push(item.description);
    if (item.time) parts.push(`⏱ 情境时间：${item.time}`);
    parts.push("⚙️ 自动执行：由哨兵 AI 规划");
    payloads.push({
      title,
      description: parts.join("\n"),
      parent_task_id: parentTaskId,
      category: baseCategory,
      priority: basePriority,
      status: "pending",
      reminder_time: iso || undefined,
      tags: ["AI自动执行", "情境时间线"],
    });
    existingChildTitles.add(nt);
    if (timeKey) existingTimeKeys.add(timeKey);
  });

  // 自动执行清单 → 子约定
  (automations || []).forEach(item => {
    const title = (item?.title || "").trim();
    if (!title) return;
    const nt = normTitle(title);
    if (existingChildTitles.has(nt)) return;
    const parts = [];
    if (item.desc) parts.push(item.desc);
    parts.push("⚙️ 自动执行：由哨兵 AI 规划");
    payloads.push({
      title,
      description: parts.join("\n"),
      parent_task_id: parentTaskId,
      category: baseCategory,
      priority: basePriority,
      status: "pending",
      tags: ["AI自动执行"],
    });
    existingChildTitles.add(nt);
  });

  if (payloads.length === 0) return 0;

  try {
    await base44.entities.Task.bulkCreate(payloads);
  } catch (e) {
    console.warn("attachPlanChildrenToParent bulkCreate failed", e);
    return 0;
  }
  return payloads.length;
}