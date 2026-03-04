import { base44 } from "@/api/base44Client";
import { format, addDays } from "date-fns";

/**
 * 从自然语言输入中用 AI 解析任务，并批量创建到约定列表。
 * @param {string} inputText - 用户的自然语言输入
 * @param {string} [contextDateStr] - 上下文日期 (YYYY-MM-DD)，默认今天
 * @returns {Promise<Array>} 创建成功的任务列表
 */
export async function extractAndCreateTasks(inputText, contextDateStr) {
  const contextDate = contextDateStr || format(new Date(), "yyyy-MM-dd");

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `从以下用户输入中提取所有具体的约定、任务和事项，生成结构化任务列表。
当前时间: ${new Date().toISOString()}
上下文日期: ${contextDate}

用户输入:
"""
${inputText}
"""

要求：
1. 每条任务必须有清晰的标题
2. 尽可能推断出具体时间（reminder_time），无法推断时默认安排在上下文日期的09:00
3. priority：根据紧迫性和重要性判断 (low/medium/high/urgent)
4. category：work/personal/health/study/family/shopping/finance/other
5. 如有子任务可以放到 subtasks 字段
6. 不要生成重复或过于相似的任务
7. 只生成真正的"约定/任务"，不要生成模糊的泛概念`,
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
              reminder_time: { type: "string", description: "ISO 8601 datetime" },
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
    let reminderTime;
    if (t.reminder_time) {
      const parsed = new Date(t.reminder_time);
      reminderTime = isNaN(parsed.getTime()) ? new Date(`${contextDate}T09:00:00`) : parsed;
    } else {
      reminderTime = new Date(`${contextDate}T09:00:00`);
    }

    const taskPayload = {
      title: t.title,
      description: t.description || "",
      reminder_time: reminderTime.toISOString(),
      priority: t.priority || "medium",
      category: t.category || "personal",
      status: "pending",
      is_all_day: t.is_all_day || false,
    };

    const created = await base44.entities.Task.create(taskPayload);

    // Create subtasks if any
    if (t.subtasks && t.subtasks.length > 0) {
      await Promise.all(
        t.subtasks.filter(st => st.title?.trim()).map(st =>
          base44.entities.Task.create({
            title: st.title,
            parent_task_id: created.id,
            priority: st.priority || t.priority || "medium",
            category: t.category || "personal",
            reminder_time: reminderTime.toISOString(),
            status: "pending",
          })
        )
      );
    }

    createdTasks.push(created);
  }

  return createdTasks;
}