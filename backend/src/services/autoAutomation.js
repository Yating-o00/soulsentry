import {
  executeAutomation,
  detectAutomationTypeFromInput,
  AUTOMATION_EXECUTE_COSTS,
} from "./executeAutomation.js";

const MIN_CONTENT_CHARS = 12;

function isDoneStatus(status) {
  return ["completed", "done", "archived", "deleted"].includes(String(status || "").toLowerCase());
}

function isDemoUser(user) {
  const email = String(user?.email || "").toLowerCase();
  return email.includes("demo") || email.endsWith("@example.com");
}

// 主动检测约定内容中可自动执行的部分，生成执行单并异步执行 plan → execute。
// 全程 fire-and-forget：任何失败只记录日志，不影响主流程。
export async function maybeAutoExecute(task, userId, prisma) {
  try {
    if (!task?.id || !userId || !prisma) return;
    if (isDoneStatus(task.status)) return;

    const content = `${task.title || ""}\n${task.description || ""}`.trim();
    if (content.length < MIN_CONTENT_CHARS) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { aiCredits: true, email: true },
    });
    if (!user || isDemoUser(user)) return;

    // 内容不足以判定可自动执行的类型则跳过
    const automationType = detectAutomationTypeFromInput(content);
    if (!automationType) return;

    // 副作用型（会真实创建日程/子任务）不主动执行，交由用户手动发起
    if (automationType === "calendar_event") return;

    // 去重：该约定已有自动执行单则跳过
    const existing = await prisma.taskExecution.findFirst({
      where: {
        taskId: task.id,
        userId,
        automationType: { not: "none" },
      },
      select: { id: true },
    });
    if (existing) return;

    // 额度预检：plan + execute 两阶段费用
    const planCost = AUTOMATION_EXECUTE_COSTS.plan ?? 5;
    const executeCost = AUTOMATION_EXECUTE_COSTS[automationType] ?? AUTOMATION_EXECUTE_COSTS.default;
    if (user.aiCredits < planCost + executeCost) return;

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
  } catch (err) {
    console.error("[autoAutomation] 触发器异常:", err?.message || err);
  }
}

async function runAutoPhases(executionId, userId, prisma) {
  const planResult = await executeAutomation({ executionId, phase: "plan", userId, prisma });
  // 需要用户批准的类型（如邮件草稿）停在 waiting_confirm，不继续执行
  if (planResult?.data?.requires_approval) return;
  await executeAutomation({ executionId, phase: "execute", userId, prisma });
}
