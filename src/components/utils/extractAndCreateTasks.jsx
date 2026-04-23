import { base44 } from "@/api/base44Client";
import { normalizeTaskTime, getTimeContextForAI } from "@/lib/timeCore";

/**
 * 从自然语言输入中用 AI 生成"一个父约定 + 可选的子执行项"，并创建到约定列表。
 *
 * 规则：
 *   - 始终只创建一个父约定（代表用户输入的整体意图）
 *   - 仅当 AI 从原文中明确拆解出可独立执行的步骤时，才作为子约定挂到父约定下
 *   - 没有明确子项时，不创建任何子约定
 */

// 并发锁：防止同一 (input, contextDate) 被重复处理
const inflightMap = new Map();

function normTitle(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase();
  const cnNum = { "零": "0", "一": "1", "二": "2", "两": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9", "十": "10" };
  s = s.replace(/[零一二两三四五六七八九十]/g, (c) => cnNum[c] || c);
  s = s.replace(/[\s\p{P}]+/gu, "");
  s = s.replace(/(订|点|叫)外卖/g, "订外卖");
  s = s.replace(/(去|前往)/g, "去");
  s = s.replace(/(打电话|打个电话|拨电话)/g, "打电话");
  s = s.replace(/(一下|一会儿|一会|下|了|的|呢|吧|啊|哦)/g, "");
  return s;
}

function isWithinTolerance(isoA, isoB, toleranceMin = 30) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (isNaN(a) || isNaN(b)) return false;
  return Math.abs(a - b) <= toleranceMin * 60 * 1000;
}

function toDateKey(val) {
  if (!val || typeof val !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function isDuplicate(titleKeyA, timeA, isAllDayA, titleKeyB, timeB, isAllDayB) {
  if (!titleKeyA || titleKeyA !== titleKeyB) return false;
  if (!timeA || !timeB) return true;
  if (isAllDayA || isAllDayB) return toDateKey(timeA) === toDateKey(timeB);
  if (isWithinTolerance(timeA, timeB, 30)) return true;
  if (toDateKey(timeA) === toDateKey(timeB)) return true;
  return false;
}

async function doExtractAndCreate(inputText, contextDateStr) {
  const timeCtx = getTimeContextForAI();
  const contextDate = contextDateStr || timeCtx.today_date;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: [
      "从以下用户输入中生成一个父约定及其可选的子执行项。",
      "",
      timeCtx.promptSnippet,
      "",
      `上下文日期（未明确指定时的归属）: ${contextDate}`,
      "",
      "用户输入:",
      '"""',
      inputText,
      '"""',
      "",
      "严格要求：",
      "1. 必须只生成【一个父约定】(parent)，代表用户输入的整体意图",
      "2. parent.title 用简短概括(≤20字)描述整体意图",
      "3. parent.description 必须【原样摘抄用户输入原文】，不要改写、润色、压缩",
      "4. 仅当用户输入中明确包含多个可独立执行的步骤或事项时，才输出 subtasks；否则 subtasks 必须为空数组 []",
      "5. 严禁编造、扩写、补全不在原文中的子项（例如用户只说\"给妈妈打电话\"，不要虚构\"准备话题/拨号/记笔记\"之类的子项）",
      `6. reminder_time 使用 ISO 8601 带 +08:00 时区，例如 "${contextDate}T09:00:00+08:00"`,
      "7. 全天任务时 reminder_time 使用 YYYY-MM-DD 且 is_all_day: true",
      `8. 无法推断具体时间时，默认 ${contextDate} 09:00`,
      "9. priority: low/medium/high/urgent",
      "10. category: work/personal/health/study/family/shopping/finance/other",
    ].join("\n"),
    response_json_schema: {
      type: "object",
      properties: {
        parent: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            reminder_time: { type: "string" },
            end_time: { type: "string" },
            is_all_day: { type: "boolean" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
          },
          required: ["title"],
        },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            },
            required: ["title"],
          },
        },
      },
      required: ["parent"],
    },
  });

  const parent = result?.parent;
  if (!parent?.title) return [];

  const normalized = normalizeTaskTime(
    {
      reminder_time: parent.reminder_time,
      end_time: parent.end_time,
      is_all_day: parent.is_all_day,
    },
    contextDate
  );

  // 数据库层去重：同标题 + 时间容差
  const titleKey = normTitle(parent.title);
  if (titleKey) {
    try {
      const recentTasks = await base44.entities.Task.list("-created_date", 200);
      const dup = (recentTasks || []).find(rt => {
        if (rt.deleted_at || rt.parent_task_id) return false;
        const key = normTitle(rt.title);
        return isDuplicate(key, rt.reminder_time || null, !!rt.is_all_day, titleKey, normalized.reminder_time, normalized.is_all_day);
      });
      if (dup) return [];
    } catch (_) { /* ignore */ }
  }

  // 创建父约定（description 始终保留用户原始输入）
  const created = await base44.entities.Task.create({
    title: parent.title,
    description: inputText,
    reminder_time: normalized.reminder_time,
    end_time: normalized.end_time,
    is_all_day: normalized.is_all_day,
    priority: parent.priority || "medium",
    category: parent.category || "personal",
    status: "pending",
    gcal_sync_enabled: true,
  });

  // 仅当 AI 返回了明确的子执行项时才创建子约定
  const subtasks = Array.isArray(result?.subtasks) ? result.subtasks.filter(s => s?.title?.trim()) : [];
  if (subtasks.length > 0) {
    await Promise.all(
      subtasks.map(st =>
        base44.entities.Task.create({
          title: st.title,
          parent_task_id: created.id,
          priority: st.priority || parent.priority || "medium",
          category: parent.category || "personal",
          reminder_time: normalized.reminder_time,
          end_time: normalized.end_time,
          is_all_day: normalized.is_all_day,
          status: "pending",
        })
      )
    );
  }

  return [created];
}

export async function extractAndCreateTasks(inputText, contextDateStr) {
  const input = (inputText || "").trim();
  if (!input) return [];
  const ctx = contextDateStr || "";
  const lockKey = `${ctx}::${input}`;

  if (inflightMap.has(lockKey)) return inflightMap.get(lockKey);

  const p = doExtractAndCreate(input, contextDateStr).finally(() => {
    setTimeout(() => inflightMap.delete(lockKey), 10000);
  });
  inflightMap.set(lockKey, p);
  return p;
}