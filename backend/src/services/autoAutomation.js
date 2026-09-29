import {
  executeAutomation,
  detectAutomationTypeFromInput,
  AUTOMATION_EXECUTE_COSTS,
} from "./executeAutomation.js";

const MIN_CONTENT_CHARS = 6;

// 从对话里启动浏览器 Agent 的成本预检（与 delegateAutoExecute 一致）
async function checkBrowserBudget(userId, prisma) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCredits: true, email: true },
  });
  if (!user || isDemoUser(user)) return { ok: false, reason: "演示账户不支持浏览器小助手" };
  const planCost = AUTOMATION_EXECUTE_COSTS.plan ?? 5;
  const executeCost = AUTOMATION_EXECUTE_COSTS.browser_task ?? AUTOMATION_EXECUTE_COSTS.default;
  if (user.aiCredits < planCost + executeCost) {
    return { ok: false, reason: `AI 点数不足（需 ${planCost + executeCost} 点）` };
  }
  return { ok: true };
}

// 对话内嵌 Agent：无需先建约定，直接从聊天启动一个浏览器执行单，
// 结果与互动回落到对话里（守护记录同步可见）。
export async function startStandaloneBrowserExecution({ goal, userId, prisma }) {
  if (!goal || !userId || !prisma) return { status: "skipped", reason: "参数无效" };
  const budget = await checkBrowserBudget(userId, prisma);
  if (!budget.ok) return { status: "skipped", reason: budget.reason };

  const execution = await prisma.taskExecution.create({
    data: {
      userId,
      taskId: null,
      taskTitle: String(goal).slice(0, 120),
      category: "task",
      executionStatus: "pending",
      originalInput: String(goal).slice(0, 2000),
      automationType: "browser_task",
    },
  });

  console.log(`[autoAutomation] chat-embedded browser agent execution=${execution.id}`);

  runAutoPhases(execution.id, userId, prisma).catch((err) => {
    console.error(`[autoAutomation] 对话内嵌浏览器 Agent 失败 execution=${execution.id}:`, err?.message || err);
  });

  return { status: "started", executionId: execution.id };
}

function isDoneStatus(status) {
  return ["completed", "done", "archived", "deleted"].includes(String(status || "").toLowerCase());
}

function isDemoUser(user) {
  const email = String(user?.email || "").toLowerCase();
  return email.includes("demo") || email.endsWith("@example.com");
}

// 核心逻辑：检测并启动自动执行。返回结果供 UI 反馈（delegate 入口用），
// maybeAutoExecute 只是它的 fire-and-forget 包装。
export async function delegateAutoExecute(task, userId, prisma) {
  if (!task?.id || !userId || !prisma) return { status: "skipped", reason: "参数无效" };
  if (isDoneStatus(task.status)) return { status: "skipped", reason: "约定已完成" };

  const content = `${task.title || ""}\n${task.description || ""}`.trim();
  if (content.length < MIN_CONTENT_CHARS) return { status: "skipped", reason: "内容太短" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCredits: true, email: true },
  });
  if (!user || isDemoUser(user)) return { status: "skipped", reason: "演示账户不支持" };

  // 内容不足以判定可自动执行的类型则跳过
  const automationType = detectAutomationTypeFromInput(content);
  if (!automationType) return { status: "skipped", reason: "未识别到可自动执行的内容" };

  // 副作用型（会真实创建日程/子任务）不主动执行，交由用户手动发起
  if (automationType === "calendar_event") return { status: "skipped", reason: "日程类需要手动确认" };

  // 去重：该约定已有自动执行单则直接返回
  const existing = await prisma.taskExecution.findFirst({
    where: {
      taskId: task.id,
      userId,
      automationType: { not: "none" },
    },
    select: { id: true },
  });
  if (existing) return { status: "existing", executionId: existing.id };

  // 额度预检：plan + execute 两阶段费用
  const planCost = AUTOMATION_EXECUTE_COSTS.plan ?? 5;
  const executeCost = AUTOMATION_EXECUTE_COSTS[automationType] ?? AUTOMATION_EXECUTE_COSTS.default;
  if (user.aiCredits < planCost + executeCost) {
    return { status: "skipped", reason: `AI 点数不足（需 ${planCost + executeCost} 点）` };
  }

  const execution = await prisma.taskExecution.create({
    data: {
      userId,
      taskId: task.id,
      taskTitle: String(task.title || "").slice(0, 120),
      category: "task",
      executionStatus: "pending",
      originalInput: content.slice(0, 2000),
      automationType,
    },
  });

  console.log(`[autoAutomation] task=${task.id} type=${automationType} execution=${execution.id}`);

  // 异步执行，不阻塞请求
  runAutoPhases(execution.id, userId, prisma).catch((err) => {
    console.error(`[autoAutomation] task=${task.id} 自动执行失败:`, err?.message || err);
  });

  return { status: "started", executionId: execution.id, automationType };
}

// 主动检测约定内容中可自动执行的部分，生成执行单并异步执行 plan → execute。
// 全程 fire-and-forget：任何失败只记录日志，不影响主流程。
export async function maybeAutoExecute(task, userId, prisma) {
  try {
    const result = await delegateAutoExecute(task, userId, prisma);
    if (result.status === "skipped") {
      console.log(`[autoAutomation] task=${task?.id} 跳过：${result.reason}`);
    }
  } catch (err) {
    console.error("[autoAutomation] 触发器异常:", err?.message || err);
  }
}

export async function runAutoPhases(executionId, userId, prisma) {
  const planResult = await executeAutomation({ executionId, phase: "plan", userId, prisma });
  // 副作用型（会真实创建日程）不继续执行，停在待确认由用户手动发起
  if (planResult?.data?.automation_type === "calendar_event") return;
  await executeAutomation({ executionId, phase: "execute", userId, prisma });
}
