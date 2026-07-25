import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const weeklyPlansRouter = Router();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const weeklyPlanCreateSchema = z.object({
  week_start_date: z.string().regex(datePattern, "week_start_date 必须是 YYYY-MM-DD"),
  original_input: z.string().optional(),
  theme: z.string().optional(),
  summary: z.string().optional(),
  plan_json: z.any(),
  is_active: z.boolean().optional()
});

const weeklyPlanUpdateSchema = weeklyPlanCreateSchema.partial();

weeklyPlansRouter.use(requireAuth);

function parseSort(sort = "-week_start_date") {
  const value = String(sort || "-week_start_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    week_start_date: "weekStartDate",
    created_date: "createdAt",
    updated_date: "updatedAt"
  };
  return { [mapping[key] || "weekStartDate"]: order };
}

function serializeWeeklyPlan(plan) {
  return {
    id: plan.id,
    week_start_date: plan.weekStartDate,
    original_input: plan.originalInput,
    theme: plan.theme,
    summary: plan.summary,
    plan_json: plan.planJson,
    is_active: plan.isActive,
    created_date: plan.createdAt,
    updated_date: plan.updatedAt
  };
}

weeklyPlansRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.week_start_date) where.weekStartDate = String(req.query.week_start_date);
  if (req.query.is_active !== undefined) {
    const value = String(req.query.is_active).toLowerCase();
    where.isActive = value === "true" || value === "1";
  }

  const plans = await prisma.weeklyPlan.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(plans.map(serializeWeeklyPlan));
});

weeklyPlansRouter.get("/:id", async (req, res) => {
  const plan = await prisma.weeklyPlan.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!plan) {
    return res.status(404).json({ error: "NOT_FOUND", message: "周计划不存在" });
  }

  return res.json(serializeWeeklyPlan(plan));
});

weeklyPlansRouter.post("/", async (req, res) => {
  const payload = weeklyPlanCreateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const plan = await prisma.weeklyPlan.create({
    data: {
      userId: req.user.id,
      weekStartDate: payload.data.week_start_date,
      originalInput: payload.data.original_input,
      theme: payload.data.theme,
      summary: payload.data.summary,
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active ?? true
    }
  });

  return res.status(201).json(serializeWeeklyPlan(plan));
});

weeklyPlansRouter.patch("/:id", async (req, res) => {
  const payload = weeklyPlanUpdateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.weeklyPlan.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "周计划不存在" });
  }

  const plan = await prisma.weeklyPlan.update({
    where: { id: existing.id },
    data: {
      weekStartDate: payload.data.week_start_date,
      originalInput: payload.data.original_input,
      theme: payload.data.theme,
      summary: payload.data.summary,
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active
    }
  });

  return res.json(serializeWeeklyPlan(plan));
});

weeklyPlansRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.weeklyPlan.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "周计划不存在" });
  }

  await prisma.weeklyPlan.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
