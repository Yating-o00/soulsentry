import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

const TEST_EMAIL = "demo@soulsentry.local";
const TEST_PASSWORD = "123456";
const LEGACY_DEMO_EMAIL = "demo@gmail.com";
const TEST_CREDITS = 10000;

export async function ensureDemoUser() {
  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    // 1. 已存在 demo@soulsentry.local：同步密码与点数，确保可直接登录
    const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (existing) {
      const updated = await prisma.user.update({
        where: { email: TEST_EMAIL },
        data: {
          passwordHash,
          aiCredits: Math.max(existing.aiCredits, TEST_CREDITS),
          subscriptionPlan: "pro"
        }
      });
      console.log(`[ensureDemoUser] test account ready: ${TEST_EMAIL}`);
      return updated;
    }

    // 2. 如果之前迁移到了 demo@gmail.com，把它迁回 demo@soulsentry.local
    const legacy = await prisma.user.findUnique({ where: { email: LEGACY_DEMO_EMAIL } });
    if (legacy) {
      const migrated = await prisma.user.update({
        where: { id: legacy.id },
        data: {
          email: TEST_EMAIL,
          passwordHash,
          displayName: "SoulSentry 测试账号",
          aiCredits: Math.max(legacy.aiCredits, TEST_CREDITS),
          subscriptionPlan: "pro"
        }
      });
      console.log(`[ensureDemoUser] migrated demo account: ${LEGACY_DEMO_EMAIL} -> ${TEST_EMAIL}`);
      return migrated;
    }

    // 3. 否则新建测试账号
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: "SoulSentry 测试账号",
        subscriptionPlan: "pro",
        aiCredits: TEST_CREDITS,
        preferences: {
          create: {
            locale: "zh-CN",
            timezone: "Asia/Shanghai"
          }
        },
        creditTxs: {
          create: {
            type: "GIFT",
            amount: TEST_CREDITS,
            balanceAfter: TEST_CREDITS,
            description: "初始化测试账号点数"
          }
        }
      }
    });

    console.log(`[ensureDemoUser] created test account: ${user.email}`);
    return user;
  } catch (error) {
    console.error("[ensureDemoUser] failed to create demo user:", error);
    // 不要阻塞启动，记录错误即可
    return null;
  }
}
