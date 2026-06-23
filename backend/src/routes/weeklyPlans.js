import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const weeklyPlansRouter = Router();

const weeklyPlanInputSchema = z.object({
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  original_input: z.string().optional().nullable(),
  theme: z.string().max(200).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  plan_json: z.any(),
  is_active: z.boolean().optional()
});

weeklyPlansRouter.use(requireAuth);

function parseSort(sort = "-week_start_date") {
  const value = String(sort || "-week_start_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    week_start_date: "weekStartDate"
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
    created_by_id: plan.userId,
    created_by: plan.user?.email || null,
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
    const value = String(req.query.is_active).trim().toLowerCase();
    where.isActive = value === "true" || value === "1";
  }

  const items = await prisma.weeklyPlan.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });

  return res.json(items.map(serializeWeeklyPlan));
});

weeklyPlansRouter.get("/:id", async (req, res) => {
  const item = await prisma.weeklyPlan.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { user: true }
  });

  if (!item) {
    return res.status(404).json({ error: "NOT_FOUND", message: "周规划不存在" });
  }

  return res.json(serializeWeeklyPlan(item));
});

weeklyPlansRouter.post("/", async (req, res) => {
  const payload = weeklyPlanInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const item = await prisma.weeklyPlan.create({
    data: {
      userId: req.user.id,
      weekStartDate: payload.data.week_start_date,
      originalInput: payload.data.original_input || null,
      theme: payload.data.theme || null,
      summary: payload.data.summary || null,
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active ?? true
    },
    include: { user: true }
  });

  return res.status(201).json(serializeWeeklyPlan(item));
});

weeklyPlansRouter.patch("/:id", async (req, res) => {
  const payload = weeklyPlanInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.weeklyPlan.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "周规划不存在" });
  }

  const item = await prisma.weeklyPlan.update({
    where: { id: existing.id },
    data: {
      weekStartDate: payload.data.week_start_date,
      originalInput: payload.data.original_input === undefined ? undefined : (payload.data.original_input || null),
      theme: payload.data.theme === undefined ? undefined : (payload.data.theme || null),
      summary: payload.data.summary === undefined ? undefined : (payload.data.summary || null),
      planJson: payload.data.plan_json,
      isActive: payload.data.is_active
    },
    include: { user: true }
  });

  return res.json(serializeWeeklyPlan(item));
});

weeklyPlansRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.weeklyPlan.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "周规划不存在" });
  }

  await prisma.weeklyPlan.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
