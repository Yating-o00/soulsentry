import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

const DEMO_EMAIL = "demo@soulsentry.local";
const DEMO_PASSWORD = "demo123456";

export async function ensureDemoUser() {
  try {
    const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) {
      console.log(`[ensureDemoUser] demo user already exists: ${DEMO_EMAIL}`);
      return existing;
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash,
        displayName: "SoulSentry Demo",
        subscriptionPlan: "free",
        aiCredits: 200,
        preferences: {
          create: {
            locale: "zh-CN",
            timezone: "Asia/Shanghai"
          }
        },
        creditTxs: {
          create: {
            type: "GIFT",
            amount: 200,
            balanceAfter: 200,
            description: "初始化演示点数"
          }
        }
      }
    });

    console.log(`[ensureDemoUser] created demo user: ${user.email}`);
    return user;
  } catch (error) {
    console.error("[ensureDemoUser] failed to create demo user:", error);
    // 不要阻塞启动，记录错误即可
    return null;
  }
}
