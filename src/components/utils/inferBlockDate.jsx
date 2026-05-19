// 旧数据兼容：focus_blocks 里可能没有 date 字段，但 title 里写了 "Day1/Day2/Day3..."
// 根据 baseDateStr (=Day1 所在日期) + title 中的 DayN 推断每条 block 应该属于哪天。
import { format, addDays, parseISO } from "date-fns";

// 支持多种 DayN 表达：
//   Day1 / Day 2 / D3 / 第1天 / 第二天 / 第3日
const DAY_PATTERNS = [
  /Day\s*([1-9]\d?)/i,             // Day1, Day 2
  /\bD([1-9]\d?)\b/i,               // D1, D2
  /第\s*([1-9]\d?)\s*[天日]/,        // 第1天, 第3日
];

// 中文数字（一~十）映射为 Day 序号
const CN_NUM_MAP = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const CN_PATTERN = /第\s*([一二两三四五六七八九十])\s*[天日]/;

/**
 * 从 title 提取 Day 序号（Day1=1, Day2=2 ...）
 * @returns {number|null}
 */
export function extractDayIndex(title) {
  if (!title) return null;
  const s = String(title);
  for (const re of DAY_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n >= 1 && n <= 30) return n;
    }
  }
  const cn = s.match(CN_PATTERN);
  if (cn && CN_NUM_MAP[cn[1]]) return CN_NUM_MAP[cn[1]];
  return null;
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