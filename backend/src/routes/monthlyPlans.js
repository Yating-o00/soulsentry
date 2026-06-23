import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const monthlyPlansRouter = Router();

const monthlyPlanInputSchema = z.object({
  month_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  original_input: z.string().optional().nullable(),
  theme: z.string().max(200).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  plan_json: z.any(),
  is_active: z.boolean().optional()
});

monthlyPlansRouter.use(requireAuth);

function parseSort(sort = "-month_start_date") {
  const value = String(sort || "-month_start_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    month_start_date: "monthStartDate"
  };
  return { [mapping[key] || "monthStartDate"]: order };
}

function serializeMonthlyPlan(plan) {
  return {
    id: plan.id,
    month_start_date: plan.monthStartDate,
    original_input: plan.originalInput,
    theme: plan.theme,
    summary: plan.summary,
    plan_json: plan.planJson,
    is_active: plan.isActive,
    created_by_id: plan.userId,
    created_by: plan.user?.email || null,
    created_date: plan.createdAt,
    updated_date: plan.updatedAt
  };
}

monthlyPlansRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = parseSort(req.query.sort || req.query.orderBy);
  const where = { userId: req.user.id };

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.month_start_date) where.monthStartDate = String(req.query.month_start_date);
  if (req.query.is_active !== undefined) {
    const value = String(req.query.is_active).trim().toLowerCase();
    where.isActive = value === "true" || value === "1";
  }

  const items = await prisma.monthlyPlan.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(items.map(serializeMonthlyPlan));
});

monthlyPlansRouter.get("/:id", async (req, res) => {
  const item = await prisma.monthlyPlan.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { user: true }
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "月规划不存在" });
  }

  return res.json(serializeMonthlyPlan(item));
});

monthlyPlansRouter.post("/", async (req, res) => {
  const payload = monthlyPlanInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.monthlyPlan.create({
    data: {
      userId: req.user.id,
      monthStartDate: payload.data.month_start_date,
      originalInput: payload.data.original_input || null,
      theme: payload.data.theme || null,
      summary: payload.data.summary || null,
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active ?? true
    },
    include: { user: true }
  });

  return res.status(201).json(serializeMonthlyPlan(item));
});

monthlyPlansRouter.patch("/:id", async (req, res) => {
  const payload = monthlyPlanInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.monthlyPlan.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "月规划不存在" });
  }

  const item = await prisma.monthlyPlan.update({
    where: { id: existing.id },
    data: {
      monthStartDate: payload.data.month_start_date,
      originalInput: payload.data.original_input === undefined ? undefined : (payload.data.original_input || null),
      theme: payload.data.theme === undefined ? undefined : (payload.data.theme || null),
      summary: payload.data.summary === undefined ? undefined : (payload.data.summary || null),
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active
    },
    include: { user: true }
  });

  return res.json(serializeMonthlyPlan(item));
});

monthlyPlansRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.monthlyPlan.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "月规划不存在" });
  }

  await prisma.monthlyPlan.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
