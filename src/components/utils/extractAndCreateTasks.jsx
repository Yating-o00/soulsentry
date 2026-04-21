import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { normalizeTaskTime, getTimeContextForAI } from "@/lib/timeCore";

/**
 * 从自然语言输入中用 AI 解析任务，并批量创建到约定列表。
 *
 * 所有创建的任务都会：
 *   - 使用 lib/timeCore 统一规范化时间（Asia/Shanghai 时区，带补全逻辑）
 *   - 默认启用 Google Calendar 同步（gcal_sync_enabled=true）
 *
 * @param {string} inputText - 用户的自然语言输入
 * @param {string} [contextDateStr] - 上下文日期 (YYYY-MM-DD)，默认今天
 * @returns {Promise<Array>} 创建成功的任务列表
 */
export async function extractAndCreateTasks(inputText, contextDateStr) {
  const timeCtx = getTimeContextForAI();
  const contextDate = contextDateStr || timeCtx.today_date;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `从以下用户输入中提取所有具体的约定、任务和事项，生成结构化任务列表。

${timeCtx.promptSnippet}

上下文日期: ${contextDate}

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
6. priority：根据紧迫性和重要性判断 (low/medium/high/urgent)
7. category：work/personal/health/study/family/shopping/finance/other
8. 如有子任务可以放到 subtasks 字段
9. 不要生成重复或过于相似的任务
10. 只生成真正的"约定/任务"，不要生成模糊的泛概念`,
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

  const createdTasks = [];

  for (const t of result.tasks) {
    // 使用统一时间规范化
    const normalized = normalizeTaskTime(
      {
        reminder_time: t.reminder_time,
        end_time: t.end_time,
        is_all_day: t.is_all_day,
      },
      contextDate
    );

    const taskPayload = {
      title: t.title,
      description: t.description || "",
      reminder_time: normalized.reminder_time,
      end_time: normalized.end_time,
      is_all_day: normalized.is_all_day,
      priority: t.priority || "medium",
      category: t.category || "personal",
      status: "pending",
      gcal_sync_enabled: true, // 默认开启日历同步
    };

    const created = await base44.entities.Task.create(taskPayload);

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