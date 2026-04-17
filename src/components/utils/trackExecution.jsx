import { base44 } from "@/api/base44Client";

const SOURCE_CONFIG = {
  welcome: { label: "欢迎页", emoji: "👋", color: "purple" },
  dashboard: { label: "智能日程", emoji: "📋", color: "blue" },
  task: { label: "约定页", emoji: "🤝", color: "indigo" },
  note: { label: "心签页", emoji: "📝", color: "emerald" },
  notification: { label: "通知中心", emoji: "🔔", color: "amber" },
  calendar_day: { label: "日规划", emoji: "📅", color: "blue" },
  calendar_week: { label: "周规划", emoji: "🗓️", color: "teal" },
  calendar_month: { label: "月规划", emoji: "📆", color: "violet" },
};

export { SOURCE_CONFIG };

/**
 * 创建一条富上下文的 TaskExecution 记录。
 * @param {object} params
 * @param {string} params.title - 任务/内容标题
 * @param {string} params.originalInput - 用户原始输入
 * @param {string} params.source - 来源标识
 * @param {string} [params.category] - promise | task | note
 * @param {string} [params.taskId] - 关联的任务ID
 * @param {object} [params.planContext] - 规划上下文
 * @param {string} [params.planContext.date] - 规划日期
 * @param {Array}  [params.planContext.timelineItems] - 时间线条目
 * @param {Array}  [params.planContext.automationItems] - 自动执行清单
 * @param {Array}  [params.planContext.syncTargets] - 同步目标 ["tasks","notes","calendar"]
 * @returns {Promise<object>}
 */
export async function createExecutionRecord({ title, originalInput, source, category, taskId, planContext }) {
  const now = new Date().toISOString();
  const cfg = SOURCE_CONFIG[source] || { label: source, emoji: "⚡", color: "slate" };

  // Build rich execution steps from plan context
  const steps = [];

  // Step 1: Source capture
  steps.push({
    step_name: "意图捕获",
    status: "completed",
    detail: `${cfg.emoji} 来源: ${cfg.label}`,
    timestamp: now,
  });

  // Step 2: AI analysis
  steps.push({
    step_name: "AI智能解析",
    status: "completed",
    detail: title?.slice(0, 60) || "内容已解析",
    timestamp: now,
  });

  // Step 3+: Timeline items created
  if (planContext?.timelineItems?.length > 0) {
    steps.push({
      step_name: "日程生成",
      status: "completed",
      detail: `已规划 ${planContext.timelineItems.length} 个时间段: ${planContext.timelineItems.slice(0, 3).map(t => t.time ? `${t.time} ${t.title}` : t.title).join('、')}${planContext.timelineItems.length > 3 ? '...' : ''}`,
      timestamp: now,
    });
  }

  // Step 4: Automation items
  if (planContext?.automationItems?.length > 0) {
    steps.push({
      step_name: "执行清单",
      status: "completed",
      detail: `已生成 ${planContext.automationItems.length} 项: ${planContext.automationItems.slice(0, 3).map(a => a.title).join('、')}${planContext.automationItems.length > 3 ? '...' : ''}`,
      timestamp: now,
    });
  }

  // Step 5: Sync targets
  if (planContext?.syncTargets?.length > 0) {
    const targetLabels = { tasks: "约定", notes: "心签", calendar: "日历" };
    steps.push({
      step_name: "数据同步",
      status: "completed",
      detail: `已同步到: ${planContext.syncTargets.map(t => targetLabels[t] || t).join(' + ')}`,
      timestamp: now,
    });
  }

  // Fallback if no rich steps
  if (steps.length <= 2) {
    steps.push({
      step_name: "创建完成",
      status: "completed",
      detail: title?.slice(0, 40) || "已创建",
      timestamp: now,
    });
  }

  const aiParsedResult = {
    intent: title || "",
    summary: title || "",
    source: source,
    source_label: cfg.label,
    source_emoji: cfg.emoji,
  };

  if (planContext?.date) {
    aiParsedResult.plan_date = planContext.date;
  }
  if (planContext?.timelineItems?.length > 0) {
    aiParsedResult.timeline_count = planContext.timelineItems.length;
  }
  if (planContext?.automationItems?.length > 0) {
    aiParsedResult.automation_count = planContext.automationItems.length;
  }

  const execution = await base44.entities.TaskExecution.create({
    task_id: taskId || "",
    task_title: `[${cfg.label}] ${(title || "").slice(0, 50)}`,
    original_input: originalInput || title || "",
    category: category || "task",
    execution_status: "completed",
    completed_at: now,
    ai_parsed_result: aiParsedResult,
    execution_steps: steps,
  });

  return execution;
}

/**
 * 创建一条正在执行中的 TaskExecution 记录。
 */
export async function createPendingExecution({ title, originalInput, source, category }) {
  const now = new Date().toISOString();
  const cfg = SOURCE_CONFIG[source] || { label: source, emoji: "⚡" };

  return base44.entities.TaskExecution.create({
    task_title: `[${cfg.label}] ${(title || "").slice(0, 50)}`,
    original_input: originalInput || title || "",
    category: category || "task",
    execution_status: "parsing",
    ai_parsed_result: {
      source: source,
      source_label: cfg.label,
      source_emoji: cfg.emoji,
    },
    execution_steps: [
      { step_name: "意图捕获", status: "completed", detail: `${cfg.emoji} 来源: ${cfg.label}`, timestamp: now },
      { step_name: "AI解析", status: "running", detail: "正在分析内容...", timestamp: now },
      { step_name: "任务生成", status: "pending", detail: "等待创建", timestamp: null },
      { step_name: "同步处理", status: "pending", detail: "等待同步", timestamp: null },
    ],
  });
}

/**
 * 更新 execution 记录为完成状态。
 */
export async function completeExecution(executionId, { taskId, steps, errorMessage } = {}) {
  const now = new Date().toISOString();
  const updateData = {
    execution_status: errorMessage ? "failed" : "completed",
    completed_at: now,
  };
  if (taskId) updateData.task_id = taskId;
  if (steps) updateData.execution_steps = steps;
  if (errorMessage) updateData.error_message = errorMessage;

  return base44.entities.TaskExecution.update(executionId, updateData);
}