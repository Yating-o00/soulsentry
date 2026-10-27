// 授予/收回管理员：node scripts/grant-admin.js <email> [--revoke]
import { prisma } from "../src/lib/prisma.js";

const email = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("用法: node scripts/grant-admin.js <email> [--revoke]");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`用户不存在: ${email}`);
  process.exit(1);
}

await prisma.user.update({
  where: { id: user.id },
  data: { role: revoke ? "USER" : "ADMIN" },
});

console.log(`${revoke ? "已收回" : "已授予"}管理员: ${email}`);
await prisma.$disconnect();
