// 旧数据兼容：focus_blocks 里可能没有 date 字段，但 title 里写了 "Day1/Day2/Day3..."
// 根据 baseDateStr (=Day1 所在日期) + title 中的 DayN 推断每条 block 应该属于哪天。
import { format, addDays, parseISO } from "date-fns";

const DAY_PATTERN = /Day\s*([1-9]\d?)/i;

/**
 * 从 title 提取 Day 序号（Day1=1, Day2=2 ...）
 * @returns {number|null}
 */
export function extractDayIndex(title) {
  if (!title) return null;
  const m = String(title).match(DAY_PATTERN);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (isNaN(n) || n < 1 || n > 30) return null;
  return n;
}

/**
 * 给一组 focus_blocks 推断出每条的 date。
 * - 已经有 date 字段的：保持
 * - 没有 date 但 title 含 DayN：date = baseDateStr + (N-1) 天
 * - 都没有：fallback 到 baseDateStr
 * @param {Array} blocks
 * @param {string} baseDateStr - Day1 对应的日期 YYYY-MM-DD（通常是 plan_date）
 * @returns {Array} 新数组（不修改原数据）
 */
export function inferDatesForBlocks(blocks, baseDateStr) {
  if (!Array.isArray(blocks) || !baseDateStr) return blocks || [];
  let baseDate;
  try {
    baseDate = parseISO(baseDateStr);
  } catch {
    return blocks;
  }
  return blocks.map(b => {
    if (!b) return b;
    if (b.date) return b;
    const dayIdx = extractDayIndex(b.title);
    if (dayIdx && dayIdx >= 1) {
      const d = addDays(baseDate, dayIdx - 1);
      return { ...b, date: format(d, "yyyy-MM-dd") };
    }
    return { ...b, date: baseDateStr };
  });
}