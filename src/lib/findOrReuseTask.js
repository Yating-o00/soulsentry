// 跨入口任务去重 / 复用工具
// 在创建顶层任务前调用：若存在"同标题 + 当日/同分钟时间窗"的活跃任务，则返回它；否则返回 null。
// 用于防止：
//   1) 同一句用户输入被多次提交时产生重复父任务
//   2) AI 把 daily plan 中的 automation 项当作独立顶层任务再创建一次
import { base44 } from "@/api/base44Client";

function normTitle(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase();
  const cnNum = { "零": "0", "一": "1", "二": "2", "两": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9", "十": "10" };
  s = s.replace(/[零一二两三四五六七八九十]/g, (c) => cnNum[c] || c);
  // 去掉前导 emoji / 装饰符
  s = s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s🎯⏱⚙️✨📍]+/u, "");
  s = s.replace(/[\s\p{P}]+/gu, "");
  return s;
}

function isSameDayBJ(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA);
  const b = new Date(isoB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
  const fmt = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  return fmt(a) === fmt(b);
}

function isWithinMinutes(isoA, isoB, minutes = 30) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (isNaN(a) || isNaN(b)) return false;
  return Math.abs(a - b) <= minutes * 60 * 1000;
}

/**
 * 在最近的 200 条任务中查找重复
 * @param {object} candidate { title, reminder_time, is_all_day, parent_task_id }
 * @returns 已存在的 Task 或 null
 */
export async function findReusableTask(candidate) {
  if (!candidate || !candidate.title) return null;
  // 已经显式声明为子任务的不参与去重（让子任务可以独立挂在不同父下）
  if (candidate.parent_task_id) return null;

  const targetKey = normTitle(candidate.title);
  if (!targetKey) return null;

  try {
    const recent = await base44.entities.Task.list("-created_date", 200);
    const reuse = (recent || []).find((t) => {
      if (!t || t.deleted_at) return false;
      // 仅对"活跃"顶层任务做复用，已完成/取消的不视为重复
      if (t.status === "completed" || t.status === "cancelled") return false;
      if (t.parent_task_id) return false;
      if (normTitle(t.title) !== targetKey) return false;

      // 标题完全一致：
      //   - 若候选无时间，则任意已存在的同名活跃任务都视为重复
      //   - 若候选有时间，则要求同日（容差 30 分钟内更稳）
      if (!candidate.reminder_time) return true;
      if (!t.reminder_time) return true;
      if (isWithinMinutes(t.reminder_time, candidate.reminder_time, 30)) return true;
      if (isSameDayBJ(t.reminder_time, candidate.reminder_time)) return true;
      return false;
    });
    return reuse || null;
  } catch (_) {
    return null;
  }
}