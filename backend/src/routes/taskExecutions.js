import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const taskExecutionsRouter = Router();

const taskExecutionCreateSchema = z.object({
  task_id: z.string().optional(),
  task_title: z.string().min(1).max(240),
  category: z.string().optional(),
  execution_status: z.string().min(1).max(40),
  original_input: z.string().optional(),
  ai_parsed_result: z.any().optional(),
  execution_steps: z.any().optional(),
  error_message: z.string().optional(),
  completed_at: z.string().datetime().optional().nullable(),
  automation_type: z.string().optional(),
  automation_plan: z.any().optional(),
  automation_result: z.any().optional(),
  requires_approval: z.boolean().optional(),
  user_feedback: z.any().optional()
});

const taskExecutionUpdateSchema = taskExecutionCreateSchema.partial();

taskExecutionsRouter.use(requireAuth);

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    completed_at: "completedAt"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function serializeTaskExecution(execution) {
  return {
    id: execution.id,
    task_id: execution.taskId || "",
    task_title: execution.taskTitle,
    category: execution.category,
    execution_status: execution.executionStatus,
    original_input: execution.originalInput,
    ai_parsed_result: execution.aiParsedResult,
    execution_steps: execution.executionSteps,
    error_message: execution.errorMessage,
    completed_at: execution.completedAt,
    automation_type: execution.automationType,
    automation_plan: execution.automationPlan,
    automation_result: execution.automationResult,
    requires_approval: execution.requiresApproval,
    user_feedback: execution.userFeedback,
    created_date: execution.createdAt,
    updated_date: execution.updatedAt
  };
}

taskExecutionsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.task_id) {
    const value = String(req.query.task_id);
    if (value.trim()) where.taskId = value;
  }
  if (req.query.execution_status) where.executionStatus = String(req.query.execution_status);
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.automation_type) where.automationType = String(req.query.automation_type);

  const executions = await prisma.taskExecution.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(executions.map(serializeTaskExecution));
});

taskExecutionsRouter.get("/:id", async (req, res) => {
  const execution = await prisma.taskExecution.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!execution) {
    return res.status(404).json({ error: "NOT_FOUND", message: "执行记录不存在" });
  }

  return res.json(serializeTaskExecution(execution));
});

taskExecutionsRouter.post("/", async (req, res) => {
  const payload = taskExecutionCreateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const execution = await prisma.taskExecution.create({
    data: {
      userId: req.user.id,
      taskId: payload.data.task_id && payload.data.task_id.trim() ? payload.data.task_id.trim() : null,
      taskTitle: payload.data.task_title,
      category: payload.data.category || "task",
      executionStatus: payload.data.execution_status,
      originalInput: payload.data.original_input,
      aiParsedResult: payload.data.ai_parsed_result,
      executionSteps: payload.data.execution_steps,
      errorMessage: payload.data.error_message,
      completedAt: payload.data.completed_at ? new Date(payload.data.completed_at) : null,
      automationType: payload.data.automation_type || "none",
      automationPlan: payload.data.automation_plan,
      automationResult: payload.data.automation_result,
      requiresApproval: Boolean(payload.data.requires_approval),
      userFeedback: payload.data.user_feedback
    }
  });

  return res.status(201).json(serializeTaskExecution(execution));
});

taskExecutionsRouter.patch("/:id", async (req, res) => {
  const payload = taskExecutionUpdateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.taskExecution.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "执行记录不存在" });
  }

  const execution = await prisma.taskExecution.update({
    where: { id: existing.id },
    data: {
      taskId: payload.data.task_id === undefined
        ? undefined
        : (payload.data.task_id && payload.data.task_id.trim() ? payload.data.task_id.trim() : null),
      taskTitle: payload.data.task_title,
      category: payload.data.category,
      executionStatus: payload.data.execution_status,
      originalInput: payload.data.original_input,
      aiParsedResult: payload.data.ai_parsed_result,
      executionSteps: payload.data.execution_steps,
      errorMessage: payload.data.error_message,
      completedAt: payload.data.completed_at === undefined
        ? undefined
        : (payload.data.completed_at ? new Date(payload.data.completed_at) : null),
      automationType: payload.data.automation_type,
      automationPlan: payload.data.automation_plan,
      automationResult: payload.data.automation_result,
      requiresApproval: payload.data.requires_approval,
      userFeedback: payload.data.user_feedback
    }
  });

  return res.json(serializeTaskExecution(execution));
});

taskExecutionsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.taskExecution.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "执行记录不存在" });
  }

  await prisma.taskExecution.delete({ where: { id: existing.id } });
  return res.status(204).send();
});

