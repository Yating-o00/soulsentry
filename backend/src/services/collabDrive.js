// 协同 Agent「执行驱动」防抖调度器：
// 成员在讨论中发言后不必 @Agent，调度器聚合一小段沉默期后自动触发一轮 drive——
// Agent 自行把讨论落成/更新子约定、节点、沉淀并维护「执行概览」。
// 信任边界与扣费口径同 runCollabAgent（由消息触发者承担本次调用点数）。
import { prisma } from "../lib/prisma.js";
import { runCollabAgent } from "./collabAgent.js";

const DEBOUNCE_MS = Number(process.env.COLLAB_DRIVE_DEBOUNCE_MS || 18000);
const MIN_INTERVAL_MS = Number(process.env.COLLAB_DRIVE_MIN_INTERVAL_MS || 45000);

const timers = new Map(); // taskId -> Timeout

export function scheduleCollabDrive(taskId) {
  const prev = timers.get(taskId);
  if (prev) clearTimeout(prev);
  timers.set(taskId, setTimeout(() => {
    timers.delete(taskId);
    runCollabDrive(taskId).catch((error) => {
      console.error("[collabDrive] 执行驱动失败:", error?.message || error);
    });
  }, DEBOUNCE_MS));
}

async function runCollabDrive(taskId) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const collab = task?.metadata?.collab;
  if (!task || !collab || typeof collab !== "object") return;
  const agent = collab.agent || {};
  // Agent 被停用/暂停/关闭了自动执行驱动时，不自动跑
  if (agent.enabled === false || agent.paused === true || agent.drive === false) return;

  const latest = await prisma.comment.findFirst({
    where: { taskId: task.id },
    orderBy: { createdAt: "desc" },
    include: { user: true }
  });
  if (!latest || latest.agent || !latest.user) return; // 最新发言来自 Agent 或空间无人发言

  const lastRunAt = agent.lastDriveAt ? Date.parse(agent.lastDriveAt) : 0;
  if (lastRunAt && Date.now() - lastRunAt < MIN_INTERVAL_MS) return;

  await runCollabAgent({ taskId: task.id, action: "drive", user: latest.user });
}
