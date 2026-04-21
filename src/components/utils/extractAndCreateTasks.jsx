import { base44 } from "@/api/base44Client";
import { normalizeTaskTime, getTimeContextForAI } from "@/lib/timeCore";

/**
 * 从自然语言输入中用 AI 解析任务，并批量创建到约定列表。
 *
 * 所有创建的任务都会：
 *   - 使用 lib/timeCore 统一规范化时间（Asia/Shanghai 时区，带补全逻辑）
 *   - 默认启用 Google Calendar 同步（gcal_sync_enabled=true）
 *
 * 去重策略（三道防线）：
 *   ① 模块级并发锁：同一 (input, contextDate) 同时间只允许一次进行中调用
 *   ② 批次内去重：AI 一次输出内多条相似任务只保留一条
 *   ③ 数据库去重：与最近任务对比（标题 + 时间容差 ±10 分钟）
 */

// ① 并发锁：防止用户快速多次点击或 React 双重调用导致同一输入被重复处理
const inflightMap = new Map(); // key = `${contextDate}::${inputText}` -> Promise

/**
 * 强化的标题归一化：
 *   - 小写化
 *   - 去除所有空白/全半角标点/常见虚词
 *   - 阿拉伯数字 ↔ 中文数字（0-10）映射为统一形式（便于"十分钟"="10分钟"）
 *   - 统一近义动作词（订/点/叫 外卖 视为相同动作；完成/做完/搞定）
 */
function normTitle(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase();

  // 中文数字 → 阿拉伯数字（仅 0-10，足够覆盖"十分钟/两小时"等常见表达）
  const cnNum = { "零": "0", "一": "1", "二": "2", "两": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9", "十": "10" };
  s = s.replace(/[零一二两三四五六七八九十]/g, (c) => cnNum[c] || c);

  // 去空白与所有标点（中/英/全角）
  s = s.replace(/[\s\p{P}]+/gu, "");

  // 同义动作归一
  s = s.replace(/(订|点|叫)外卖/g, "订外卖");
  s = s.replace(/(去|前往)/g, "去");
  s = s.replace(/(打电话|打个电话|拨电话)/g, "打电话");

  // 常见修饰虚词（出现在标题中但不改变语义）
  s = s.replace(/(一下|一会儿|一会|下|了|的|呢|吧|啊|哦)/g, "");

  return s;
}

/** 两个 ISO 时间是否在 ±toleranceMin 分钟内（任一为空则 false） */
function isWithinTolerance(isoA, isoB, toleranceMin = 10) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (isNaN(a) || isNaN(b)) return false;
  return Math.abs(a - b) <= toleranceMin * 60 * 1000;
}

async function doExtractAndCreate(inputText, contextDateStr) {
  const timeCtx = getTimeContextForAI();
  const contextDate = contextDateStr || timeCtx.today_date;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `从以下用户输入中提取所有具体的约定、任务和事项，生成结构化任务列表。

${timeCtx.promptSnippet}

上下文日期（未明确指定时的归属）: ${contextDate}

用户输入:
"""
${inputText}
"""

要求：
1. 每条任务必须有清晰的标题
2. reminder_time 必须是 ISO 8601 带 +08:00 时区格式，例如："${contextDate}T09:00:00+08:00"
3. 若任务为全天（无具体时间点），reminder_time 使用纯日期 "YYYY-MM-DD"，并设置 is_all_day: true
4. 若任务有明确结束时间，end_time 用同样格式；否则省略
5. 无法推断具体时间时，默认安排在上下文日期的 09:00
6. 【重要】对"后天下午"、"下个月第一个周一"、"十分钟后"等相对时间表达，严格使用上方【预计算的日期锚点】和【相对时间段映射】，不要自己推算日期
7. priority：根据紧迫性和重要性判断 (low/medium/high/urgent)
8. category：work/personal/health/study/family/shopping/finance/other
9. 如有子任务可以放到 subtasks 字段
10. 不要生成重复或过于相似的任务（同一件事即使表述不同也只输出一条）
11. 只生成真正的"约定/任务"，不要生成模糊的泛概念`,
    response_json_schema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              reminder_time: { type: "string", description: "ISO 8601 带 +08:00 时区，或 YYYY-MM-DD 全天" },
              end_time: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
              category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
              is_all_day: { type: "boolean" },
              subtasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    priority: { type: "string" }
                  }
                }
              }
            },
            required: ["title"]
          }
        }
      }
    }
  });

  if (!result?.tasks || result.tasks.length === 0) return [];

  // ③ 数据库层去重：拉更大窗口，并索引出"同归一标题"的已有时间列表
  let recentTasks = [];
  try {
    recentTasks = await base44.entities.Task.list("-created_date", 200);
  } catch (_) {
    recentTasks = [];
  }
  // Map<normTitle, Array<reminder_time>>
  const recentIndex = new Map();
  for (const rt of recentTasks) {
    if (rt.deleted_at || rt.parent_task_id) continue;
    const key = normTitle(rt.title);
    if (!key) continue;
    if (!recentIndex.has(key)) recentIndex.set(key, []);
    recentIndex.get(key).push(rt.reminder_time || null);
  }

  // ② 本批次内去重：同归一标题 & 时间容差
  const batchCreated = []; // { titleKey, reminderISO }
  const createdTasks = [];

  for (const t of result.tasks) {
    if (!t.title) continue;

    const normalized = normalizeTaskTime(
      {
        reminder_time: t.reminder_time,
        end_time: t.end_time,
        is_all_day: t.is_all_day,
      },
      contextDate
    );

    const titleKey = normTitle(t.title);
    if (!titleKey) continue;

    // 与本批已创建任务比较（标题 + 10min 容差）
    const dupInBatch = batchCreated.some(b =>
      b.titleKey === titleKey && (
        b.reminderISO === normalized.reminder_time ||
        isWithinTolerance(b.reminderISO, normalized.reminder_time, 10)
      )
    );
    if (dupInBatch) continue;

    // 与数据库最近任务比较（标题 + 10min 容差）
    const existingTimes = recentIndex.get(titleKey) || [];
    const dupInDb = existingTimes.some(rt =>
      rt === normalized.reminder_time || isWithinTolerance(rt, normalized.reminder_time, 10)
    );
    if (dupInDb) continue;

    const taskPayload = {
      title: t.title,
      description: t.description || "",
      reminder_time: normalized.reminder_time,
      end_time: normalized.end_time,
      is_all_day: normalized.is_all_day,
      priority: t.priority || "medium",
      category: t.category || "personal",
      status: "pending",
      gcal_sync_enabled: true,
    };

    const created = await base44.entities.Task.create(taskPayload);

    // 创建后立刻把它登记到本批索引，防止后续条目与它重复
    batchCreated.push({ titleKey, reminderISO: normalized.reminder_time });
    if (!recentIndex.has(titleKey)) recentIndex.set(titleKey, []);
    recentIndex.get(titleKey).push(normalized.reminder_time);

    // Create subtasks
    if (t.subtasks && t.subtasks.length > 0) {
      await Promise.all(
        t.subtasks.filter(st => st.title?.trim()).map(st =>
          base44.entities.Task.create({
            title: st.title,
            parent_task_id: created.id,
            priority: st.priority || t.priority || "medium",
            category: t.category || "personal",
            reminder_time: normalized.reminder_time,
            end_time: normalized.end_time,
            is_all_day: normalized.is_all_day,
            status: "pending",
          })
        )
      );
    }

    createdTasks.push(created);
  }

  return createdTasks;
}

/**
 * 对外入口：带并发锁的封装。
 * 同一 (inputText, contextDate) 并发调用会共享同一个 Promise，避免重复处理。
 */
export async function extractAndCreateTasks(inputText, contextDateStr) {
  const input = (inputText || "").trim();
  if (!input) return [];
  const ctx = contextDateStr || "";
  const lockKey = `${ctx}::${input}`;

  if (inflightMap.has(lockKey)) {
    return inflightMap.get(lockKey);
  }
  const p = doExtractAndCreate(input, contextDateStr).finally(() => {
    // 延迟 2s 释放锁，防止极短时间内的重复提交（如 StrictMode 双触发）
    setTimeout(() => inflightMap.delete(lockKey), 2000);
  });
  inflightMap.set(lockKey, p);
  return p;
}