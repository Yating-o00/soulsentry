// 多日规划视图聚合：当用户用"N天/一周"规划任务时，AI 会创建多条同源 DailyPlan
// （每天一条），但每条 block 的 title 都被错误地打上了"Day1:"前缀。
// 本工具在视图层修正：以最早同源 plan_date 为 baseDate（Day1），按 plan_date 与 baseDate
// 的偏移，把当前显示的每个 block 的"Day1:"前缀替换为正确的"DayN:"。
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { detectSpanDaysFromInput } from "./inferBlockDate";

function stripDayPrefix(title) {
  if (!title) return "";
  return String(title)
    .replace(/^\s*Day\s*\d+\s*[:：追加]*\s*/i, "")
    .replace(/^\s*D\s*\d+\s*[:：追加]*\s*/i, "")
    .replace(/^\s*第\s*[一二两三四五六七八九十\d]+\s*[天日]\s*[:：追加]*\s*/, "")
    .trim();
}

/**
 * 找出与当前 dayPlan 同源的多日 DailyPlan，并计算 baseDate（Day1 所在日）。
 * 严格匹配：要求首行 original_input 完全相同，且含 2 天以上的工期表达。
 *
 * @param {Object} currentPlan - 当前选中日期的 DailyPlan
 * @param {Array} neighbors - 邻近 ±N 天的所有 DailyPlan 列表（含 currentPlan 自己）
 * @returns {{ isMulti: boolean, baseDateStr: string|null, spanDays: number, currentDayIdx: number }}
 */
export function detectMultiDayContext(currentPlan, neighbors) {
  if (!currentPlan?.original_input) {
    return { isMulti: false, baseDateStr: null, spanDays: 0, currentDayIdx: 0 };
  }
  const firstLine = String(currentPlan.original_input).split("\n")[0].trim();
  const spanDays = detectSpanDaysFromInput(firstLine);
  if (spanDays < 2 || !firstLine) {
    return { isMulti: false, baseDateStr: null, spanDays: 0, currentDayIdx: 0 };
  }
  // 找同源记录
  const sameSource = (neighbors || []).filter(p => {
    if (!p?.original_input) return false;
    const f = String(p.original_input).split("\n")[0].trim();
    return f === firstLine;
  });
  if (sameSource.length < 1) {
    return { isMulti: false, baseDateStr: null, spanDays, currentDayIdx: 0 };
  }
  // 最早 plan_date 即为 Day1
  const sorted = [...sameSource].sort((a, b) =>
    String(a.plan_date).localeCompare(String(b.plan_date))
  );
  const baseDateStr = sorted[0].plan_date;
  const baseDate = parseISO(baseDateStr);
  const currentDate = parseISO(currentPlan.plan_date);
  const diff = differenceInCalendarDays(currentDate, baseDate);
  const currentDayIdx = Math.max(0, Math.min(spanDays - 1, diff));
  return { isMulti: true, baseDateStr, spanDays, currentDayIdx };
}

/**
 * 把 focus_blocks 的 title 修正为正确的 DayN 前缀。
 * 当处于多日规划上下文时：清掉错误前缀，按 currentDayIdx 重新打标。
 */
export function fixDayPrefixForBlocks(blocks, ctx) {
  if (!Array.isArray(blocks)) return blocks || [];
  if (!ctx?.isMulti) return blocks;
  const n = ctx.currentDayIdx + 1;
  return blocks.map(b => {
    if (!b) return b;
    const clean = stripDayPrefix(b.title || "");
    const newTitle = clean ? `Day${n}: ${clean}` : `Day${n}`;
    return { ...b, title: newTitle };
  });
}