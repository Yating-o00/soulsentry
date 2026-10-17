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
 * 从用户原始输入里识别"N天/N日/一周"等持续型表达，返回工期天数（2-14），否则 0。
 */
export function detectSpanDaysFromInput(originalInput) {
  if (!originalInput) return 0;
  const s = String(originalInput);
  const m1 = s.match(/(\d+)\s*天(?:内|里|内完成|搞定|解决|完成|做完)?/);
  if (m1) { const n = parseInt(m1[1], 10); if (n >= 2 && n <= 14) return n; }
  const cnMap = { 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const m2 = s.match(/([两二三四五六七八九十])\s*天(?:内|里|内完成|搞定|解决|完成|做完)?/);
  if (m2 && cnMap[m2[1]]) return cnMap[m2[1]];
  if (/一周|本周内|这周内|7\s*天|七\s*天/.test(s)) return 7;
  return 0;
}

/**
 * 给一组 focus_blocks 推断出每条的 date。
 * - title 含 DayN：以 DayN 为权威，纠正 date = baseDateStr + (N-1) 天
 * - 没 DayN 但已有 date：保留
 * - 都没有：fallback 到 baseDateStr
 *
 * 旧脏数据兜底：当 originalInput 含"N天/三天"，且推断后所有条目仍集中在 baseDateStr 同一天，
 * 按条目顺序均分到 N 天，并自动补齐 DayN 前缀。
 *
 * @param {Array} blocks
 * @param {string} baseDateStr - Day1 对应的日期 YYYY-MM-DD（通常是 plan_date）
 * @param {string} [originalInput] - 用户原始输入（用于识别多日工期）
 * @returns {Array} 新数组（不修改原数据）
 */
// 从 title 中移除错误/统一的 "DayN:" 前缀，准备重新打标
function stripDayPrefix(title) {
  if (!title) return "";
  return String(title)
    .replace(/^\s*Day\s*\d+\s*[:：]?\s*/i, "")
    .replace(/^\s*D\s*\d+\s*[:：]?\s*/i, "")
    .replace(/^\s*第\s*[一二两三四五六七八九十\d]+\s*[天日]\s*[:：]?\s*/, "")
    .trim();
}

export function inferDatesForBlocks(blocks, baseDateStr, originalInput) {
  if (!Array.isArray(blocks) || !baseDateStr) return blocks || [];
  let baseDate;
  try {
    baseDate = parseISO(baseDateStr);
  } catch {
    return blocks;
  }

  const spanDays = detectSpanDaysFromInput(originalInput);

  // 提取每条 block 的 DayN（来自 title）
  const dayIndices = blocks.map(b => extractDayIndex(b?.title));
  const validDays = dayIndices.filter(d => d != null);

  // 关键脏数据检测：当存在多日工期，但 title 里的 DayN 全部相同（例如全是 Day1），
  // 说明 LLM 把多日规划全打成了一天，此时 DayN 标记完全不可信，直接按时间均分。
  const allSameDay = validDays.length >= 2 && new Set(validDays).size === 1;
  const forceRebalance = spanDays >= 2 && (allSameDay || (validDays.length === 0 && blocks.length >= 2));

  if (!forceRebalance) {
    // 正常路径：title 中 DayN 权威优先
    const firstPass = blocks.map((b, i) => {
      if (!b) return b;
      const dayIdx = dayIndices[i];
      if (dayIdx && dayIdx >= 1) {
        const d = addDays(baseDate, dayIdx - 1);
        return { ...b, date: format(d, "yyyy-MM-dd") };
      }
      if (b.date) return b;
      return { ...b, date: baseDateStr };
    });

    // 兜底：识别多日工期 + 所有条目集中在同一天 → 按顺序均分
    if (spanDays >= 2) {
      const uniqueDates = new Set(firstPass.map(b => b?.date).filter(Boolean));
      if (uniqueDates.size === 1 && firstPass.length >= 2) {
        return rebalanceAcrossDays(firstPass, baseDate, spanDays);
      }
    }

    return firstPass;
  }

  // 强制重排：按时间均分到 spanDays，并清理错误的 DayN 前缀后重新打标
  return rebalanceAcrossDays(blocks, baseDate, spanDays);
}

function rebalanceAcrossDays(blocks, baseDate, spanDays) {
  const indexed = blocks.map((b, i) => ({ b, i }));
  indexed.sort((x, y) => {
    const tx = String(x.b?.time || "99:99");
    const ty = String(y.b?.time || "99:99");
    return tx.localeCompare(ty);
  });
  const total = indexed.length;
  const perDay = Math.max(1, Math.ceil(total / spanDays));
  const result = new Array(total);
  indexed.forEach((entry, orderIdx) => {
    const dayIdx = Math.min(spanDays - 1, Math.floor(orderIdx / perDay));
    const d = addDays(baseDate, dayIdx);
    const newDate = format(d, "yyyy-MM-dd");
    const cleanTitle = stripDayPrefix(entry.b?.title || "");
    const newTitle = cleanTitle ? `Day${dayIdx + 1}: ${cleanTitle}` : `Day${dayIdx + 1}`;
    result[entry.i] = { ...entry.b, date: newDate, title: newTitle };
  });
  return result;
}