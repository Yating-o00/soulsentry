import { base44 } from "@/api/base44Client";

/**
 * 创建一条 TaskExecution 记录，用于在通知页面展示执行动态。
 * @param {object} params
 * @param {string} params.title - 任务/内容标题
 * @param {string} params.originalInput - 用户原始输入
 * @param {string} params.source - 来源标识: welcome | dashboard | task | note | notification
 * @param {string} [params.category] - promise | task | note
 * @param {string} [params.taskId] - 关联的任务ID
 * @returns {Promise<object>} 创建的 execution 记录
 */
export async function createExecutionRecord({ title, originalInput, source, category, taskId }) {
  const now = new Date().toISOString();

  const sourceLabels = {
    welcome: "欢迎页",
    dashboard: "智能日程",
    task: "约定页",
    note: "心签页",
    notification: "通知中心",
    calendar_day: "日视图",
    calendar_week: "周视图",
    calendar_month: "月视图",
  };

  const sourceLabel = sourceLabels[source] || source;

  const execution = await base44.entities.TaskExecution.create({
    task_id: taskId || "",
    task_title: `[${sourceLabel}] ${(title || "").slice(0, 50)}`,
    original_input: originalInput || title || "",
    category: category || "task",
    execution_status: "completed",
    completed_at: now,
    execution_steps: [
      { step_name: "内容录入", status: "completed", detail: `来源: ${sourceLabel}`, timestamp: now },
      { step_name: "创建完成", status: "completed", detail: title?.slice(0, 40) || "已创建", timestamp: now },
    ],
  });

  return execution;
}

/**
 * 创建一条正在执行中的 TaskExecution 记录（用于异步流程）。
 * @returns {Promise<object>} 创建的 execution 记录
 */
export async function createPendingExecution({ title, originalInput, source, category }) {
  const now = new Date().toISOString();
  const sourceLabels = {
    welcome: "欢迎页",
    dashboard: "智能日程",
    task: "约定页",
    note: "心签页",
    notification: "通知中心",
  };
  const sourceLabel = sourceLabels[source] || source;

  return base44.entities.TaskExecution.create({
    task_title: `[${sourceLabel}] ${(title || "").slice(0, 50)}`,
    original_input: originalInput || title || "",
    category: category || "task",
    execution_status: "parsing",
    execution_steps: [
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