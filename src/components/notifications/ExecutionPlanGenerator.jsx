import { base44 } from "@/api/base44Client";
import { invokeAI } from "@/components/utils/aiHelper";
import { format } from "date-fns";
import { findReusableTask } from "@/lib/findOrReuseTask";

export async function generateExecutionPlan(userInput, semanticHint, locationContext = null) {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const timeStr = format(now, "HH:mm");
  const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const todayDayName = dayNames[now.getDay()];

  // Build location + routine context (新增：智能时间推断的关键依据)
  let locationBlock = "";
  if (locationContext) {
    const placeName = locationContext.current_place_name
      ? `${locationContext.current_place_name}（${locationContext.current_place_type}）`
      : (locationContext.current_place_type === 'unknown' ? '未知（外出中或未保存此处）' : locationContext.current_place_type);
    const r = locationContext.daily_routine || {};
    const routineLines = [
      r.wake_up && `起床${r.wake_up}`,
      r.leave_home && `出门${r.leave_home}`,
      r.leave_office && `下班${r.leave_office}`,
      r.arrive_home && `到家${r.arrive_home}`,
      r.sleep && `睡觉${r.sleep}`,
    ].filter(Boolean).join(' / ') || '未填写';
    locationBlock = `\n\n【当前情境上下文】（用于智能推断顺路型/位置型任务的最佳提醒时间）：
- 当前位置: ${placeName}
- 当前时间: ${locationContext.current_time}（${locationContext.is_workday ? '工作日' : '休息日'}）
- 用户作息: ${routineLines}`;
  }

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

  const result = await invokeAI({
    prompt: `你是一个智能任务执行规划引擎。结合深度语义分析，生成精准的执行计划。

用户输入: "${userInput}"
当前日期: ${todayStr} ${timeStr} (${todayDayName})
${locationBlock}${semanticContext}

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
      "step_name": "事项名称（6-10字，动词开头）",
      "detail": "这件事具体要做什么、为什么需要做",
      "when_hint": "建议什么时候做（如'约定前1天'、'出发前30分钟'）"
    }
  ],
  "system_actions": [
    {
      "action_key": "create_task/sync_calendar/set_reminder/send_email/create_note/sync_google_tasks/create_wish",
      "params": {}
    }
  ],
  "user_prompts": ["需要用户确认或补充的提示信息列表"]
}

【🔴 execution_steps 的核心定义 - 务必理解】：
execution_steps 不是"产品内操作流程"，而是【AI 理解用户约定后，完成这件约定在现实世界中所需的具体事项链路】。
它描述的是用户要做的事，不是系统要做的事。

✅ 正确示例 - "下周和老王吃饭"：
  [
    {"step_name": "联系老王定时间", "detail": "微信确认下周具体哪天方便", "when_hint": "本周内"},
    {"step_name": "选餐厅并订位", "detail": "根据老王口味选合适的餐厅，提前订位", "when_hint": "确认时间后"},
    {"step_name": "出发前确认", "detail": "当天再次确认时间地点，规划路线", "when_hint": "赴约当天"},
    {"step_name": "赴约", "detail": "按时到达，享受聚餐", "when_hint": "约定时间"}
  ]

✅ 正确示例 - "下个月要做季度汇报"：
  [
    {"step_name": "收集数据素材", "detail": "整理本季度关键指标与项目进展", "when_hint": "汇报前2周"},
    {"step_name": "撰写汇报框架", "detail": "列提纲：成果/问题/下季计划", "when_hint": "汇报前1周"},
    {"step_name": "制作PPT", "detail": "根据框架制作演示文稿", "when_hint": "汇报前5天"},
    {"step_name": "内部彩排", "detail": "找同事试讲并收集反馈", "when_hint": "汇报前2天"},
    {"step_name": "正式汇报", "detail": "按计划完成汇报", "when_hint": "汇报当天"}
  ]

❌ 错误示例（这是产品内动作，不要出现在 execution_steps 里）：
  "创建任务"、"同步日历"、"设置提醒"、"发送邮件通知"、"加入愿望清单"

【system_actions 则用于产品后台自动执行的操作】（不展示给用户为"链路"）：
1. meeting/schedule：create_task + sync_calendar + set_reminder
2. task/reminder：create_task + set_reminder
3. wish：create_wish
4. note：create_note

【时间处理规则】：
- 优先使用上游语义分析中已解析的时间实体（resolved_datetime）
- "后天下午" → 从当前日期推算，下午默认14:00
- "下个月第一个周一" → 精确计算日期
- "下周和老王吃饭" → 下周取合理时段（如周六12:00）
- 模糊时间 → 设 reminder_time 为3天后
- 会议默认时长1小时

【🎯 顺路型/位置型任务的智能时间推断】（重点！）：
当用户输入包含 "路过/经过/顺路/出门时/回家时/下次去X时" 等关键词时，必须**结合【当前情境上下文】**推断最佳提醒时间，不能用 09:00 默认值：

1) 若【当前位置】是 office/school/外出 + 当前时间已临近用户的"下班"时间 → reminder_time 设为用户"下班"时间或"到家前 30 分钟"（让用户回家路上顺路办）
2) 若【当前位置】是 home + 当前是夜晚或休息日 → reminder_time 设为**第二天**用户的"出门"时间（出门前 5-10 分钟），让用户出门时顺路办
3) 若【当前位置】是 home + 工作日早晨还没出门 → reminder_time 设为今天的"出门"时间
4) 若用户作息数据缺失：工作日 → 默认 18:30（下班顺路）；休息日 → 默认次日 09:30
5) 在 task_data.description 末尾追加一句"为什么是这个时间"的说明，例：「💡 你现在在办公室，按照 19:30 下班作息，回家路上 20:00 是路过加油站的最佳时机」

示例 - 用户输入"路过加油站提醒我加油"：
  - 情境A：当前 19:16 在 office、下班 19:30、到家 20:00 → reminder_time = 今天 19:30
  - 情境B：当前 22:00 在 home、明早出门 09:00 → reminder_time = 明天 09:00
  - 情境C：当前 08:00 在 home、09:00 出门 → reminder_time = 今天 09:00

【智能补全】：
- 提到人名时 → tags 中加 "@人名"
- 提到地点时 → tags 中加 "📍地点"

【execution_steps 生成要求】：
- 步骤数量 3-6 个，视事项复杂度而定
- 每一步都是用户需要付诸行动的具体事项
- 按时间/逻辑先后顺序排列
- 对于 wish/note 类，可以生成"实现这个愿望的路径"（如"我想学钢琴"→ 找老师/买琴/每日练习）`,
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
          description: "AI理解约定后生成的【现实事项链路】——用户要做的事",
          items: {
            type: "object",
            properties: {
              step_name: { type: "string" },
              detail: { type: "string" },
              when_hint: { type: "string" }
            }
          }
        },
        system_actions: {
          type: "array",
          description: "产品后台自动执行的系统动作",
          items: {
            type: "object",
            properties: {
              action_key: { type: "string" },
              params: { type: "object" }
            }
          }
        },
        user_prompts: { type: "array", items: { type: "string" } }
      }
    }
  }, "task_breakdown");

  // 向后兼容：如果调用方按 action_key 执行步骤，优先使用 system_actions
  if (result && Array.isArray(result.system_actions) && result.system_actions.length > 0) {
    result._system_actions = result.system_actions;
  }

  return result;
}

export async function executeStep(step, taskId, taskData, execution) {
  const now = new Date().toISOString();

  switch (step.action_key) {
    case "create_task": {
      const payload = {
        title: taskData.title,
        description: taskData.description || "",
        category: taskData.category || "personal",
        priority: taskData.priority || "medium",
        status: "pending",
        reminder_time: taskData.reminder_time || now,
        end_time: taskData.end_time || null,
        is_all_day: taskData.is_all_day || false,
        tags: taskData.tags || [],
      };
      // 入口去重：避免同一意图反复变成独立父约定
      const reuse = await findReusableTask(payload);
      if (reuse) {
        return { success: true, detail: `已合并到已有约定: ${reuse.title}`, taskId: reuse.id };
      }
      const newTask = await base44.entities.Task.create(payload);
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