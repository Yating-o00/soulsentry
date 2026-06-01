import { base44 } from "@/api/base44Client";

/**
 * 把月/周规划中 AI 生成的条目作为「子约定」挂到由用户输入创建的「父约定」之下。
 * 与智能日程规划保持一致：用户每次生成只产生一条父约定卡片，
 * AI 拆解出的里程碑 / 事件 / 自动执行项都挂在父约定下，作为子约定列表。
 *
 * items: [{ title, description?, time?, date?, tag? }]
 *   - date: YYYY-MM-DD，子约定的归属日期（可选）
 *   - time: HH:MM，与 date 组合成 reminder_time（可选）
 */
const normTitle = (s) => (s || "")
  .trim()
  .toLowerCase()
  .replace(/[\s\p{P}🎯⏱⚙️✨📅🏁]+/gu, "");

function buildIso(dateStr, timeStr) {
  if (!dateStr) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec((timeStr || "").trim());
  if (m) {
    const hh = String(m[1]).padStart(2, "0");
    return `${dateStr}T${hh}:${m[2]}:00+08:00`;
  }
  return undefined;
}

export async function attachPlanItemsToParent(parentTaskId, items = [], defaultTag = "AI规划") {
  if (!parentTaskId || !Array.isArray(items) || items.length === 0) return 0;

  // 已有子约定标题去重
  const existing = new Set();
  try {
    const children = await base44.entities.Task.filter({ parent_task_id: parentTaskId });
    children.forEach(t => { if (t && !t.deleted_at) existing.add(normTitle(t.title)); });
  } catch (_) { /* ignore */ }

  let parentInfo = null;
  try { parentInfo = await base44.entities.Task.get(parentTaskId); } catch (_) { /* ignore */ }
  const baseCategory = parentInfo?.category || "personal";
  const basePriority = parentInfo?.priority || "medium";

  const payloads = [];
  items.forEach(item => {
    const title = (item?.title || "").trim();
    if (!title) return;
    const nt = normTitle(title);
    if (!nt || existing.has(nt)) return;
    existing.add(nt);

    const iso = buildIso(item.date, item.time);
    payloads.push({
      title,
      description: item.description || "",
      parent_task_id: parentTaskId,
      category: baseCategory,
      priority: basePriority,
      status: "pending",
      reminder_time: iso || undefined,
      is_all_day: iso ? false : (item.date ? true : false),
      tags: [item.tag || defaultTag],
    });
  });

  if (payloads.length === 0) return 0;
  try {
    await base44.entities.Task.bulkCreate(payloads);
  } catch (e) {
    console.warn("attachPlanItemsToParent bulkCreate failed", e);
    return 0;
  }
  return payloads.length;
}