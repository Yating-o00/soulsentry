// AI 点数统一服务：所有用户触达的 AI 调用都经这里自动扣点。
// 约定：预检用 assertAICredits（402 INSUFFICIENT_CREDITS），AI 成功后用 chargeAICredits 结算；
// 余额不足的竞态（AI 已调用但扣费时余额不够）只记警告不阻断，与 analyzeHeartSign 一致。
import { prisma } from "../lib/prisma.js";

// 统一 AI 点数扣费：预检余额，事务内扣减并记账
// 余额不足时抛出 402 INSUFFICIENT_CREDITS（带 balance/required），由调用方决定阻断还是降级
export async function chargeAICredits({ userId, cost, feature, description }) {
  const amount = Math.max(1, Math.ceil(Number(cost) || 0));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const balance = user?.aiCredits ?? 0;
  if (balance < amount) {
    const error = new Error("AI 点数不足");
    error.status = 402;
    error.code = "INSUFFICIENT_CREDITS";
    error.required = amount;
    error.balance = balance;
    throw error;
  }
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { aiCredits: { decrement: amount } }
    }),
    prisma.aICreditTransaction.create({
      data: {
        userId,
        type: "CONSUME",
        amount: -amount,
        balanceAfter: balance - amount,
        feature: feature || "ai_call",
        description: description || "AI 调用"
      }
    })
  ]);
  return { charged: amount, balance: updatedUser.aiCredits };
}

// 调用 AI 前的余额预检：不足时抛 402（message 里带所需点数，前端直接 toast 即可）
export async function assertAICredits(userId, cost, feature) {
  const amount = Math.max(1, Math.ceil(Number(cost) || 1));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCredits: true }
  });
  const balance = user?.aiCredits ?? 0;
  if (balance < amount) {
    const error = new Error(`AI 点数不足（本次需要 ${amount} 点，当前余额 ${balance} 点），请前往「我的 → AI 点数」充值`);
    error.status = 402;
    error.code = "INSUFFICIENT_CREDITS";
    error.required = amount;
    error.balance = balance;
    error.feature = feature || "ai_call";
    throw error;
  }
  return balance;
}

// 按真实 token 用量结算：1 点 / 1000 token（缓存命中的输入不计费），最少 1 点
export function usageCost(usage) {
  const u = usage || {};
  const billableTokens = Math.max(
    0,
    (Number(u.prompt_tokens) || 0) + (Number(u.completion_tokens) || 0) - (Number(u.prompt_cache_hit_tokens) || 0)
  );
  return { cost: Math.max(1, Math.ceil(billableTokens / 1000)), billableTokens };
}
