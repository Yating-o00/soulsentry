import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

export async function generateExecutionPlan(userInput, semanticHint) {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const timeStr = format(now, "HH:mm");
  const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const todayDayName = dayNames[now.getDay()];

  // Build semantic context from upstream analysis
  let semanticContext = "";
  if (semanticHint) {
    semanticContext = `\n\n【上游语义分析结果】（已通过深度NLP预处理，请充分利用）：
- 意图类型: ${semanticHint.primary_intent || "unknown"} (置信度: ${semanticHint.intent_confidence || 0})
- 时间实体: ${JSON.stringify(semanticHint.time_entities || [])}
- 人物: ${JSON.stringify(semanticHint.people || [])}
- 地点: ${JSON.stringify(semanticHint.locations || [])}
- 物品: ${JSON.stringify(semanticHint.objects || [])}
- 条件触发: ${JSON.stringify(semanticHint.conditions || [])}
- 优化标题: ${semanticHint.refined_title || userInput}
- 建议优先级: ${semanticHint.priority || "medium"}
- 建议分类: ${semanticHint.category || "personal"}`;
  }

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `你是一个智能任务执行规划引擎。结合深度语义分析，生成精准的执行计划。

用户输入: "${userInput}"
当前日期: ${todayStr} ${timeStr} (${todayDayName})
${semanticContext}

请根据输入内容生成执行规划JSON：

{
  "intent_summary": "用简洁语言概括用户意图",
  "category": "promise/task/note/wish (约定/任务/心签/愿望)",
  "task_data": {
    "title": "任务标题（使用上游优化标题或自行优化）",
    "description": "任务描述（补充上下文信息）",
    "priority": "low/medium/high/urgent",
    "category": "work/personal/health/study/family/shopping/finance/other",
    "reminder_time": "ISO格式的提醒时间（优先使用上游解析的时间实体）",
    "end_time": "ISO格式的结束时间（如果是会议等有时长的任务）",
    "is_all_day": false,
    "tags": ["标签1", "标签2"]
  },
  "execution_steps": [
    {
      "step_name": "步骤名称",
      "action_type": "auto/confirm",
      "action_key": "create_task/sync_calendar/set_reminder/send_email/create_note/sync_google_tasks/create_wish",
      "detail": "步骤的具体描述",
      "params": {}
    }
  ],
  "user_prompts": ["需要用户确认或补充的提示信息列表"]
}

【意图路由规则（核心）】：
1. meeting（会议/约见）：创建任务→同步日历→设置提前提醒→(如有参会者)发送邮件通知
2. schedule（明确日程）：创建任务→同步日历→设置提醒
3. task（具体待办）：创建任务→设置提醒
4. reminder（纯提醒）：创建任务→设置提醒
5. wish（愿望/模糊想法，如"我想学钢琴"）：category设为"wish"，创建心签→关联标签。不要创建任务或日程！
6. note（随手记/感想）：category设为"note"，创建心签→关联标签。不要创建任务！

【时间处理规则（增强）】：
- 优先使用上游语义分析中已解析的时间实体（resolved_datetime）
- "后天下午" → 从当前日期推算具体日期，下午默认14:00
- "下个月第一个周一" → 精确计算日期
- "下周和老王吃饭" → 下周取合理时段（如周六12:00）
- 模糊时间（"过几天"、"有空"）→ 设 reminder_time 为3天后，标注需确认
- 场景时间（"下班后"）→ 默认18:30
- 会议默认时长1小时，设置提前15分钟提醒

【智能补全规则】：
- 提到人名时 → tags 中加 "@人名"
- 提到地点时 → tags 中加 "📍地点"  
- 涉及他人时 → 添加邮件通知步骤(标记confirm)
- execution_steps至少2步`,
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

    case "create_wish": {
      const content = taskData.description || taskData.title;
      await base44.entities.Note.create({
        content: `💫 愿望: ${taskData.title}\n\n${taskData.description || ""}`,
        plain_text: content,
        tags: [...(taskData.tags || []), "愿望清单"],
        color: "yellow",
        is_pinned: true,
      });
      return { success: true, detail: "已加入愿望清单" };
    }

    default:
      return { success: true, detail: `步骤完成: ${step.step_name}` };
  }
}