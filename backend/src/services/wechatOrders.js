import { prisma } from "../lib/prisma.js";

export async function markWechatOrderPaid({ orderNo, transactionId, paidAt }) {
  if (!orderNo) return { paid: false, order: null };

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.wechatOrder.findUnique({ where: { orderNo } });
    if (!order) return { paid: false, order: null };
    if (order.status === "PAID") return { paid: true, order };

    const user = await tx.user.findUnique({ where: { id: order.userId } });
    const currentBalance = user?.aiCredits ?? 0;
    const balanceAfter = currentBalance + order.credits;

    const nextPaidAt = paidAt || new Date();

    const updatedOrder = await tx.wechatOrder.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        transactionId: transactionId || order.transactionId,
        paidAt: nextPaidAt
      }
    });

    await tx.user.update({
      where: { id: order.userId },
      data: { aiCredits: balanceAfter }
    });

    await tx.aICreditTransaction.create({
      data: {
        userId: order.userId,
        type: "PURCHASE",
        amount: order.credits,
        balanceAfter,
        description: `微信支付充值 ${order.credits} AI 点数（订单 ${order.orderNo}）`
      }
    });

    return { paid: true, order: updatedOrder };
  });

  return result;
}

