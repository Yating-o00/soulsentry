import { prisma } from "../src/lib/prisma.js";
import "../src/config/env.js";
import { writeFileSync } from "node:fs";

// 导出全量注册用户账号清单（含活跃度线索），输出 JSON 到 stdout 并落一份 CSV。
// 用法（服务器 backend 目录）：
//   node scripts/export-users.js            # 全部注册用户
//   node scripts/export-users.js --active   # 仅"注册且使用过"（与广播口径一致）

const ACTIVE_ONLY = process.argv.includes("--active");

function getExtra(preferences) {
  return preferences?.metadata && typeof preferences.metadata === "object"
    ? preferences.metadata._extraFields || {}
    : {};
}

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      preferences: true,
      _count: { select: { tasks: true, notes: true, notifications: true, devices: true } },
      tasks: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      notes: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } }
    }
  });

  const rows = users.map((u) => {
    const extra = getExtra(u.preferences);
    const lastTaskAt = u.tasks[0]?.updatedAt || null;
    const lastNoteAt = u.notes[0]?.updatedAt || null;
    const lastActiveAt = [lastTaskAt, lastNoteAt, u.preferences?.updatedAt || null]
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;
    return {
      id: u.id,
      email: u.email || "",
      phone: u.phone || "",
      displayName: u.displayName || "",
      role: u.role,
      subscriptionPlan: u.subscriptionPlan,
      registeredAt: u.createdAt,
      lastActiveAt,
      taskCount: u._count.tasks,
      noteCount: u._count.notes,
      deviceCount: u._count.devices,
      hasPushSubscription: Boolean(extra.push_subscription),
      hasWechatOpenid: Boolean(extra.openid)
    };
  });

  const filtered = ACTIVE_ONLY
    ? rows.filter((r) => r.taskCount > 0 || r.noteCount > 0 || r.deviceCount > 0 || r.hasPushSubscription || r.hasWechatOpenid)
    : rows;

  const header = ["email", "phone", "displayName", "role", "subscriptionPlan", "registeredAt", "lastActiveAt", "taskCount", "noteCount", "deviceCount", "hasPushSubscription", "hasWechatOpenid", "id"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.join(",")]
    .concat(filtered.map((r) => header.map((h) => esc(r[h])).join(",")))
    .join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = `/tmp/soulsentry-users-${stamp}${ACTIVE_ONLY ? "-active" : ""}.csv`;
  writeFileSync(csvPath, "﻿" + csv, "utf8");

  console.log(JSON.stringify(filtered, null, 2));
  console.error(`\n共 ${filtered.length} 个账号（总注册 ${rows.length}）`);
  console.error(`CSV 已写入: ${csvPath}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
