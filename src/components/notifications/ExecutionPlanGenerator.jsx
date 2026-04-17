import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

export async function generateExecutionPlan(userInput) {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const timeStr = format(now, "HH:mm");

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `你是一个智能任务执行规划引擎。分析用户输入，生成一个可执行的通知链路和执行计划。

用户输入: "${userInput}"
当前日期: ${todayStr}
当前时间: ${timeStr}

请根据输入内容生成执行规划JSON：

{
  "intent_summary": "用简洁语言概括用户意图",
  "category": "promise/task/note (约定/任务/心签)",
  "task_data": {
    "title": "任务标题",
    "description": "任务描述",
    "priority": "low/medium/high/urgent",
    "category": "work/personal/health/study/family/shopping/finance/other",
    "reminder_time": "ISO格式的提醒时间，如果输入中有时间信息",
    "end_time": "ISO格式的结束时间（如果是会议等有时长的任务）",
    "is_all_day": false,
    "tags": ["标签1", "标签2"]
  },
  "execution_steps": [
    {
      "step_name": "步骤名称（如：创建任务、同步日历、设置提醒、发送邮件等）",
      "action_type": "auto/confirm (auto=自动执行, confirm=需用户确认)",
      "action_key": "create_task/sync_calendar/set_reminder/send_email/create_note/sync_google_tasks",
      "detail": "步骤的具体描述",
      "params": {}
    }
  ],
  "user_prompts": ["需要用户确认或补充的提示信息列表，如果全部可自动完成则为空数组"]
}

规划规则：
1. 会议类：必须包含 创建任务→同步日历→设置提前提醒→(可选)发送邮件通知参会者
2. 日程类：创建任务→同步日历→设置提醒
3. 提醒类：创建任务→设置提醒
4. 笔记类：创建心签→关联标签
5. 邮件类：创建任务→发送邮件→标记完成
6. 如果涉及他人(如会议、协作)，添加"发送邮件通知"步骤(标记为confirm)
7. 如果时间模糊(如"明天"、"下周")，给出合理的具体时间
8. 提醒时间通常设置为事件前15分钟
9. execution_steps至少有2步，体现执行链路的价值`,
    response_json_schema: {
      type: "object",
      properties: {
        intent_summary: { type: "string" },
        category: { type: "string" },
        task_data: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string" },
            category: { type: "string" },
            reminder_time: { type: "string" },
            end_time: { type: "string" },
            is_all_day: { type: "boolean" },
            tags: { type: "array", items: { type: "string" } }
          }
        },
        execution_steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step_name: { type: "string" },
              action_type: { type: "string" },
              action_key: { type: "string" },
              detail: { type: "string" },
              params: { type: "object" }
            }
          }
        },
        user_prompts: { type: "array", items: { type: "string" } }
      }
    }
  });

  return result;
}

export async function executeStep(step, taskId, taskData, execution) {
  const now = new Date().toISOString();

  switch (step.action_key) {
    case "create_task": {
      const newTask = await base44.entities.Task.create({
        title: taskData.title,
        description: taskData.description || "",
        category: taskData.category || "personal",
        priority: taskData.priority || "medium",
        status: "pending",
        reminder_time: taskData.reminder_time || now,
        end_time: taskData.end_time || null,
        is_all_day: taskData.is_all_day || false,
        tags: taskData.tags || [],
      });
      return { success: true, detail: `任务已创建: ${newTask.title}`, taskId: newTask.id };
    }

    case "sync_calendar": {
      if (!taskId) return { success: false, detail: "无任务ID，跳过日历同步" };
      await base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: taskId }).catch(() => {});
      return { success: true, detail: "已同步到Google日历" };
    }

    case "set_reminder": {
      if (!taskId) return { success: false, detail: "无任务ID" };
      const advanceMinutes = step.params?.advance_minutes || [15, 5];
      await base44.entities.Task.update(taskId, {
        advance_reminders: advanceMinutes,
        notification_channels: ["in_app", "browser"],
        reminder_sent: false,
      });
      return { success: true, detail: `提醒已设置 (提前${advanceMinutes[0]}分钟)` };
    }

    case "send_email": {
      const user = await base44.auth.me();
      await base44.integrations.Core.SendEmail({
        to: step.params?.to || user.email,
        subject: step.params?.subject || `任务通知: ${taskData.title}`,
        body: step.params?.body || `任务「${taskData.title}」已创建。\n\n${taskData.description || ''}`,
      });
      return { success: true, detail: "邮件已发送" };
    }

    case "create_note": {
      const content = step.params?.content || taskData.description || taskData.title;
      await base44.entities.Note.create({
        content: content,
        plain_text: content,
        tags: taskData.tags || ["AI创建"],
      });
      return { success: true, detail: "心签已创建" };
    }

    case "sync_google_tasks": {
      if (!taskId) return { success: false, detail: "无任务ID" };
      await base44.functions.invoke('syncToGoogleTasks', { task_id: taskId }).catch(() => {});
      return { success: true, detail: "已同步到Google Tasks" };
    }

    default:
      return { success: true, detail: `步骤完成: ${step.step_name}` };
  }
}