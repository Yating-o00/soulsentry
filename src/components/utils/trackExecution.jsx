import { base44 } from "@/api/base44Client";
import { generateRealityChain } from "@/components/utils/generateRealityChain";

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

// 来源 → 默认的 automation_type
// ⚠️ 这里创建的是"埋点记录"（用户在某个入口创建了内容时的时间线追踪），
// 不是真正跑过 executeAutomation 的自动执行产物。
// 因此默认 "none"，前端 AutomationResultPreview 会跳过它，不会渲染空白结果卡。
// 只有真正经过 executeAutomation 跑出来的记录才会有 email_draft / summary_note / ppt_doc 等有效类型。
const SOURCE_DEFAULT_AUTOMATION_TYPE = {};

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
 * @param {Array}  [params.attachedFiles] - 用户上传的附件 [{file_url, file_name, file_type}]，将写入 ai_parsed_result.attached_files 供自动执行后端解析
 * @returns {Promise<object>}
 */
export async function createExecutionRecord({ title, originalInput, source, category, taskId, planContext, attachedFiles }) {
  const now = new Date().toISOString();
  const cfg = SOURCE_CONFIG[source] || { label: source, emoji: "⚡", color: "slate" };

  // 【核心变更】执行链路不再是"产品内流程"，而是
  // AI 理解用户约定后推导的"现实事项链路"——用户真正要做的事
  let steps = [];
  try {
    const chain = await generateRealityChain({
      title,
      originalInput,
      category,
      dueAt: planContext?.date,
    });
    if (chain && chain.length > 0) {
      steps = chain.map((s) => ({
        step_name: s.step_name,
        detail: s.detail || "",
        when_hint: s.when_hint || "",
        status: "todo", // 事项链路用 todo 态，表示"待去做"，区别于产品内的 completed/running/pending
        timestamp: null,
      }));
    }
  } catch (e) {
    console.warn("generateRealityChain failed, fallback to product steps:", e);
  }

  // 将「自动执行清单」合并进执行链路末尾，作为 AI 派发的自动化事项
  if (planContext?.automationItems?.length > 0) {
    const autoSteps = planContext.automationItems.slice(0, 6).map((it) => ({
      step_name: it.title || "自动执行项",
      detail: it.desc || it.description || "AI 自动派发",
      when_hint: it.status === "ACTIVE" ? "运行中"
              : it.status === "MONITORING" ? "监控中"
              : "待就绪",
      status: "todo",
      is_automation: true, // 标记为自动化事项，UI 可用于区分样式
      timestamp: null,
    }));
    steps = [...steps, ...autoSteps];
  }

  // Fallback：AI 未产出有效链路时，回退到原产品内步骤（保持数据结构兼容）
  if (steps.length === 0) {
    steps = [
      { step_name: "意图捕获", status: "completed", detail: `${cfg.emoji} 来源: ${cfg.label}`, timestamp: now },
      { step_name: "AI智能解析", status: "completed", detail: title?.slice(0, 60) || "内容已解析", timestamp: now },
      { step_name: "创建完成", status: "completed", detail: title?.slice(0, 40) || "已创建", timestamp: now },
    ];
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
    // 保存自动执行清单明细，便于在执行记录中展示
    aiParsedResult.automation_items = planContext.automationItems.slice(0, 8).map((it) => ({
      title: it.title || "",
      status: it.status || "READY",
      desc: it.desc || it.description || "",
    }));
  }

  // 关键：把用户上传的附件原始 URL 落库，供 executeAutomation 的 buildAttachmentContext 解析
  // 没有这一步，后端永远拿到空数组 → AI 会"未识别附件内容"
  if (Array.isArray(attachedFiles) && attachedFiles.length > 0) {
    aiParsedResult.attached_files = attachedFiles
      .filter(f => f && f.file_url)
      .map(f => ({
        file_url: f.file_url,
        file_name: f.file_name || '',
        file_type: f.file_type || '',
      }));
  }

  const execution = await base44.entities.TaskExecution.create({
    task_id: taskId || "",
    task_title: `[${cfg.label}] ${(title || "").slice(0, 50)}`,
    original_input: originalInput || title || "",
    category: category || "task",
    execution_status: "completed",
    completed_at: now,
    automation_type: SOURCE_DEFAULT_AUTOMATION_TYPE[source] || "none",
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
    automation_type: SOURCE_DEFAULT_AUTOMATION_TYPE[source] || "none",
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