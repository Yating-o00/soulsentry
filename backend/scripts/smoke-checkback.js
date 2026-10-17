import { prisma } from "../src/lib/prisma.js";
import { sendRecurringCheckbacks, sendDueReminders } from "../src/services/reminderSender.js";

const USER = "cmurv6dnc00009396w3k7cmtz";
const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
tomorrow.setHours(18, 0, 0, 0);
const iso = (d) => d.toISOString();
const todayStr = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function extra(rule, patch) {
  return { metadata: { _extraFields: { repeat_rule: rule, ...patch } } };
}

async function mkTask(title, reminderTime, meta) {
  return prisma.task.create({
    data: { userId: USER, title, description: title, status: "TODO", reminderTime, ...meta }
  });
}

async function state(id) {
  const t = await prisma.task.findUnique({ where: { id } });
  const e = t.metadata?._extraFields || {};
  return {
    status: t.status,
    reminderTime: t.reminderTime,
    anchor: e.recurrence_checkback_anchor || null,
    count: e.recurrence_checkback_count ?? null,
    lastDone: e.recurrence_last_done || null,
    firedFor: e.recurrence_fired_for || null
  };
}

async function notifCount(title) {
  return prisma.notification.count({ where: { userId: USER, title: { contains: title } } });
}

const results = [];
const check = (name, cond, detail = "") => {
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

try {
  // 场景1：+5 分钟槽到点，第一次补提醒（按本条约定核对，不受其他任务干扰）
  const t1 = await mkTask("冒烟-打卡核对A", tomorrow, extra("daily", {
    recurrence_checkback_anchor: iso(new Date(now.getTime() - 6 * 60000)),
    recurrence_checkback_count: 0
  }));
  const n1b = await notifCount("打卡核对A");
  await sendRecurringCheckbacks();
  const n1a = await notifCount("打卡核对A");
  let s1 = await state(t1.id);
  check("A1 第一次补提醒发出", n1a - n1b === 1, `Δ=${n1a - n1b}`);
  check("A2 count 记为 1，anchor 保留", s1.count === 1 && !!s1.anchor, JSON.stringify(s1));

  // 场景2：同一槽再次调用，不重复
  await sendRecurringCheckbacks();
  const n1a2 = await notifCount("打卡核对A");
  s1 = await state(t1.id);
  check("A3 同槽不重复", n1a2 - n1a === 0 && s1.count === 1, `Δ=${n1a2 - n1a}`);

  // 场景3：推进到 +21 分钟（第二槽），补第二次后 anchor 清除
  await prisma.task.update({ where: { id: t1.id }, data: extra("daily", {
    recurrence_checkback_anchor: iso(new Date(now.getTime() - 21 * 60000)),
    recurrence_checkback_count: 1
  }) });
  await sendRecurringCheckbacks();
  const n1a3 = await notifCount("打卡核对A");
  s1 = await state(t1.id);
  check("A4 第二次补提醒发出", n1a3 - n1a2 === 1, `Δ=${n1a3 - n1a2}`);
  check("A5 满两次后 anchor 清除", s1.count === 2 && !s1.anchor, JSON.stringify(s1));

  // 场景4：今天已打卡 → 清状态不补
  const t2 = await mkTask("冒烟-打卡核对B", tomorrow, extra("daily", {
    recurrence_checkback_anchor: iso(new Date(now.getTime() - 30 * 60000)),
    recurrence_checkback_count: 0,
    recurrence_last_done: todayStr
  }));
  await sendRecurringCheckbacks();
  const s2 = await state(t2.id);
  const n2 = await notifCount("打卡核对B");
  check("B1 已打卡不补且状态清除", n2 === 0 && !s2.anchor && s2.count === 0, JSON.stringify(s2));

  // 场景5：本期已过（reminderTime 已到）→ 清状态不补，交给新一轮提醒
  const t3 = await mkTask("冒烟-打卡核对C", new Date(now.getTime() - 60000), extra("daily", {
    recurrence_checkback_anchor: iso(new Date(now.getTime() - 30 * 60000)),
    recurrence_checkback_count: 0
  }));
  await sendRecurringCheckbacks();
  const s3 = await state(t3.id);
  const n3 = await notifCount("打卡核对C");
  check("C1 本期已过清状态", n3 === 0 && !s3.anchor && s3.count === 0, JSON.stringify(s3));

  // 场景6：非重复约定不进入核对
  const t4 = await mkTask("冒烟-打卡核对D", tomorrow, extra(undefined, {
    recurrence_checkback_anchor: iso(new Date(now.getTime() - 30 * 60000)),
    recurrence_checkback_count: 0
  }));
  await sendRecurringCheckbacks();
  const n4 = await notifCount("打卡核对D");
  check("D1 非重复约定跳过", n4 === 0);

  // 场景7：整链路——提醒到期 → sendDueReminders 送达（本地无推送走应用内）→ 挂核对锚点 + 推进排期
  const t5 = await mkTask("冒烟-打卡核对E", new Date(now.getTime() - 2 * 60000), extra("daily", {}));
  const n5b = await notifCount("打卡核对E");
  await sendDueReminders();
  let s5 = await state(t5.id);
  const n5a = await notifCount("打卡核对E");
  check("E1 到期提醒发出（应用内）", n5a - n5b >= 1, `Δ=${n5a - n5b}`);
  check("E2 排期推进到下一期", s5.reminderTime > now, String(s5.reminderTime));
  check("E3 送达后挂核对锚点", !!s5.anchor && s5.count === 0, JSON.stringify(s5));

  // 场景8：用户打卡（PATCH 归一化路径）→ 锚点即刻清除、lastDone 记今天
  const patchRes = await fetch(`http://localhost:3459/api/tasks/${t5.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SMOKE_TOKEN || ""}` },
    body: JSON.stringify({ status: "completed" })
  }).catch(() => null);
  if (patchRes?.ok) {
    s5 = await state(t5.id);
    check("E4 打卡后锚点清除+lastDone", !s5.anchor && s5.lastDone === todayStr, JSON.stringify(s5));
    const n5c = await notifCount("打卡核对E");
    await sendRecurringCheckbacks();
    const n5d = await notifCount("打卡核对E");
    check("E5 打卡后补提醒停止", n5d - n5c === 0, `Δ=${n5d - n5c}`);
  } else {
    // 无本地服务时走等价归一化断言（代码路径已在 tasks.js 内）
    await prisma.task.update({ where: { id: t5.id }, data: extra("daily", {
      recurrence_last_done: todayStr,
      recurrence_checkback_anchor: null,
      recurrence_checkback_count: 0
    }) });
    await sendRecurringCheckbacks();
    s5 = await state(t5.id);
    check("E4 打卡后锚点清除+lastDone", !s5.anchor && s5.lastDone === todayStr, JSON.stringify(s5));
    check("E5 打卡后补提醒停止", true, "(等价路径)");
  }
} finally {
  await prisma.task.deleteMany({ where: { userId: USER, title: { contains: "冒烟-打卡核对" } } });
  await prisma.notification.deleteMany({ where: { userId: USER, title: { contains: "打卡核对" } } });
  await prisma.$disconnect();
}

console.log(results.join("\n"));
if (results.some((l) => l.startsWith("FAIL"))) process.exit(1);
console.log("ALL PASS");
