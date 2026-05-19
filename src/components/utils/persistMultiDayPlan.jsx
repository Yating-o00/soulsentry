import { base44 } from "@/api/base44Client";

/**
 * 当 AI 返回的 timeline / automations 跨多天时（条目带 date 字段），
 * 按 date 分组把"非当日"的条目分别写入各自日期的 DailyPlan。
 *
 * 注意：当日（selectedDateStr）的条目由调用方自行处理，本函数只处理"其它日期"。
 *
 * @param {object} params
 * @param {Array} params.timeline   - AI 返回的 timeline 条目（每项可能含 date）
 * @param {Array} params.automations - AI 返回的 automations（无 date，仅在第一天补充一次）
 * @param {string} params.selectedDateStr - 当前主操作日期，将被跳过
 * @param {string} params.originalInput   - 用户原始输入，用于 original_input 字段
 * @returns {Promise<string[]>} 实际写入/更新的额外日期列表
 */
export async function persistExtraDaysFromTimeline({
  timeline,
  automations,
  selectedDateStr,
  originalInput,
}) {
  if (!Array.isArray(timeline) || timeline.length === 0) return [];

  // 按 date 分组（仅保留非当日且日期合法的条目）
  const groups = new Map(); // date -> blocks[]
  for (const t of timeline) {
    const d = t?.date;
    if (!d || d === selectedDateStr) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push({
      time: t.time,
      title: t.title,
      description: t.description || "",
      type: t.type || "focus",
    });
  }
  if (groups.size === 0) return [];

  const writtenDates = [];
  // 串行写入，避免并发覆盖
  for (const [date, blocks] of groups.entries()) {
    try {
      const existing = await base44.entities.DailyPlan.filter({ plan_date: date });
      const ep = existing?.[0];
      const mergedFocus = [...((ep?.plan_json?.focus_blocks) || []), ...blocks];
      // 简单去重：time+title
      const seen = new Set();
      const dedupedFocus = mergedFocus.filter(b => {
        const k = `${String(b.time||"").trim().toLowerCase()}|${String(b.title||"").trim().toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const planJson = {
        key_tasks: ep?.plan_json?.key_tasks || [],
        focus_blocks: dedupedFocus,
        devices: ep?.plan_json?.devices || [],
      };
      const record = {
        plan_date: date,
        original_input: [ep?.original_input, originalInput].filter(Boolean).join("\n"),
        theme: ep?.theme || "",
        summary: ep?.summary || "",
        plan_json: planJson,
        is_active: true,
      };
      if (ep?.id) {
        await base44.entities.DailyPlan.update(ep.id, record);
      } else {
        await base44.entities.DailyPlan.create(record);
      }
      writtenDates.push(date);
    } catch (e) {
      console.warn(`[persistExtraDaysFromTimeline] failed for ${date}`, e);
    }
  }
  return writtenDates;
}