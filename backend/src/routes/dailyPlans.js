import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const dailyPlansRouter = Router();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const dailyPlanCreateSchema = z.object({
  plan_date: z.string().regex(datePattern, "plan_date 必须是 YYYY-MM-DD"),
  original_input: z.string().optional(),
  theme: z.string().optional(),
  summary: z.string().optional(),
  plan_json: z.any(),
  is_active: z.boolean().optional()
});

const dailyPlanUpdateSchema = dailyPlanCreateSchema.partial();

dailyPlansRouter.use(requireAuth);

function parseSort(sort = "-plan_date") {
  const value = String(sort || "-plan_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    plan_date: "planDate",
    created_date: "createdAt",
    updated_date: "updatedAt"
  };
  return { [mapping[key] || "planDate"]: order };
}

function serializeDailyPlan(plan) {
  return {
    id: plan.id,
    plan_date: plan.planDate,
    original_input: plan.originalInput,
    theme: plan.theme,
    summary: plan.summary,
    plan_json: plan.planJson,
    is_active: plan.isActive,
    created_date: plan.createdAt,
    updated_date: plan.updatedAt
  };
}

dailyPlansRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.plan_date) where.planDate = String(req.query.plan_date);
  if (req.query.is_active !== undefined) {
    const value = String(req.query.is_active).toLowerCase();
    where.isActive = value === "true" || value === "1";
  }

  const plans = await prisma.dailyPlan.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(plans.map(serializeDailyPlan));
});

dailyPlansRouter.get("/:id", async (req, res) => {
  const plan = await prisma.dailyPlan.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!plan) {
    return res.status(404).json({ error: "NOT_FOUND", message: "日计划不存在" });
  }

  return res.json(serializeDailyPlan(plan));
});

dailyPlansRouter.post("/", async (req, res) => {
  const payload = dailyPlanCreateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const plan = await prisma.dailyPlan.create({
    data: {
      userId: req.user.id,
      planDate: payload.data.plan_date,
      originalInput: payload.data.original_input,
      theme: payload.data.theme,
      summary: payload.data.summary,
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active ?? true
    }
  });

  return res.status(201).json(serializeDailyPlan(plan));
});

dailyPlansRouter.patch("/:id", async (req, res) => {
  const payload = dailyPlanUpdateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.dailyPlan.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "日计划不存在" });
  }

  const plan = await prisma.dailyPlan.update({
    where: { id: existing.id },
    data: {
      planDate: payload.data.plan_date,
      originalInput: payload.data.original_input,
      theme: payload.data.theme,
      summary: payload.data.summary,
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active
    }
  });

  return res.json(serializeDailyPlan(plan));
});

dailyPlansRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.dailyPlan.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "日计划不存在" });
  }

  await prisma.dailyPlan.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
