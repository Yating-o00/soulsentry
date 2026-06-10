import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@soulsentry.local";
  const passwordHash = await bcrypt.hash("demo123456", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
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

  console.log(`Seeded demo user: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
