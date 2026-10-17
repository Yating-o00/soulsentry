import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const creditsRouter = Router();

const topUpSchema = z.object({
  amount: z.number().int().positive(),
  description: z.string().max(120).optional()
});

const transactionCreateSchema = z.object({
  type: z.string().min(1),
  amount: z.number().int(),
  balance_after: z.number().int().min(0).optional(),
  feature: z.string().max(120).optional(),
  description: z.string().max(255).optional()
});

creditsRouter.use(requireAuth);

creditsRouter.get("/balance", async (req, res) => {
  return res.json({
    ai_credits: req.user.aiCredits,
    subscription_plan: req.user.subscriptionPlan
  });
});

creditsRouter.get("/transactions", async (req, res) => {
  const txs = await prisma.aICreditTransaction.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return res.json(
    txs.map((item) => ({
      id: item.id,
      type: item.type.toLowerCase(),
      amount: item.amount,
      balance_after: item.balanceAfter,
      feature: item.feature,
      description: item.description,
      created_date: item.createdAt
    }))
  );
});

creditsRouter.post("/transactions", async (req, res) => {
  const payload = transactionCreateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const normalizedType = String(payload.data.type || "PURCHASE").toUpperCase();
  const allowedTypes = new Set(["PURCHASE", "CONSUME", "GIFT", "REFUND", "SUBSCRIPTION_BONUS"]);
  const nextBalance = payload.data.balance_after ?? req.user.aiCredits;

  if (!allowedTypes.has(normalizedType)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "不支持的点数流水类型" });
  }

  const tx = await prisma.aICreditTransaction.create({
    data: {
      userId: req.user.id,
      type: normalizedType,
      amount: payload.data.amount,
      balanceAfter: nextBalance,
      feature: payload.data.feature,
      description: payload.data.description
    }
  });

  return res.status(201).json({
    id: tx.id,
    type: tx.type.toLowerCase(),
    amount: tx.amount,
    balance_after: tx.balanceAfter,
    feature: tx.feature,
    description: tx.description,
    created_date: tx.createdAt
  });
});

creditsRouter.post("/top-up", async (req, res) => {
  const payload = topUpSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const nextBalance = req.user.aiCredits + payload.data.amount;

  const [user, tx] = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.id },
      data: { aiCredits: nextBalance }
    }),
    prisma.aICreditTransaction.create({
      data: {
        userId: req.user.id,
        type: "PURCHASE",
        amount: payload.data.amount,
        balanceAfter: nextBalance,
        description: payload.data.description || `充值 ${payload.data.amount} AI 点数`
      }
    })
  ]);

  return res.status(201).json({
    ai_credits: user.aiCredits,
    transaction: {
      id: tx.id,
      type: tx.type.toLowerCase(),
      amount: tx.amount,
      balance_after: tx.balanceAfter,
      description: tx.description,
      created_date: tx.createdAt
    }
  });
});
