// 协同约定的「主动推动」轮询：空间停滞时，Agent 主动出现推进事件。
// 触发信号（满足其一且冷却期过后）：成员 ≥24h 无发言且有未决事项；草案 ≥24h 未确认；
// 节点 48h 内到期且 ≥12h 无成员发言。Agent 以讨论消息 + 站内通知推动相关成员，幂等防刷屏。
import { prisma } from "../lib/prisma.js";
import { assertAICredits, chargeAICredits } from "./aiCredits.js";
import { AI_CALL_COSTS } from "../routes/functions.js";
import { collectSubtasks, logCollabChange } from "./collabSpace.js";
import { buildSystem, formatSpaceData, loadSpaceSnapshot, postAgentMessage } from "./collabAgent.js";
import { callKimiChat } from "../lib/kimi.js";

const STALE_MS = 24 * 3600 * 1000;       // 成员多久没发言算停滞
const NODE_WINDOW_MS = 48 * 3600 * 1000; // 节点临期窗口
const AGENT_QUIET_MS = 12 * 3600 * 1000; // Agent 自己刚说过话就闭嘴
const NUDGE_COOLDOWN_MS = 24 * 3600 * 1000; // 同一空间推动冷却
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const COST = () => AI_CALL_COSTS.collab_agent || 2;

function displayName(u) {
  return u?.displayName || u?.email || u?.phone || "成员";
}

// 模板兜底：LLM 不可用/余额不足时也能推动（不扣点）
function fallbackNudge({ task, members, stuckDrafts, dueSoonNodes }) {
  const names = members.map((m) => m.name).join("、");
  const lines = [`@${names} 我们的「${task.title}」有一会儿没有新进展了，一起往前推一步：`];
  if (stuckDrafts.length > 0) lines.push(`· 子约定草案「${stuckDrafts[0].title}」还待确认，谁方便先看一下？`);
  if (dueSoonNodes.length > 0) lines.push(`· 节点「${dueSoonNodes[0].title}」快到期了，需要定下来。`);
  if (stuckDrafts.length === 0 && dueSoonNodes.length === 0) lines.push("· 在讨论里说一句最新进展，或 @我 整理下一步。");
  lines.push("有任何新想法直接发在讨论里，我会持续跟着整理。");
  return lines.join("\n");
}

async function maybeNudgeTask(task) {
  const collab = task.metadata?.collab;
  if (!collab || collab.agent?.paused === true || collab.agent?.enabled === false) return;

  const now = Date.now();
  const agentMeta = collab.agent || {};
  if (agentMeta.lastNudgeAt && now - new Date(agentMeta.lastNudgeAt).getTime() < NUDGE_COOLDOWN_MS) return;

  const [lastMemberComment, lastAgentComment] = await Promise.all([
    prisma.comment.findFirst({ where: { taskId: task.id, agent: false }, orderBy: { createdAt: "desc" } }),
    prisma.comment.findFirst({ where: { taskId: task.id, agent: true }, orderBy: { createdAt: "desc" } })
  ]);
  if (lastAgentComment && now - lastAgentComment.createdAt.getTime() < AGENT_QUIET_MS) return;

  const subtasks = await collectSubtasks(task.id);
  const nodes = await prisma.collabNode.findMany({ where: { taskId: task.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const lastMemberAt = lastMemberComment ? lastMemberComment.createdAt.getTime() : new Date(task.createdAt).getTime();
  const stale = now - lastMemberAt >= STALE_MS;

  const stuckDrafts = subtasks.filter((s) => s.metadata?.collab?.state === "draft");
  const activeNotDone = subtasks.filter((s) => s.metadata?.collab?.state !== "draft" && s.status !== "DONE");
  const dueSoonNodes = nodes.filter((n) => !n.doneAt && n.dueAt && new Date(n.dueAt).getTime() - now <= NODE_WINDOW_MS && new Date(n.dueAt).getTime() >= now - 24 * 3600 * 1000);
  const unfinished = stuckDrafts.length > 0 || activeNotDone.length > 0 || nodes.some((n) => !n.doneAt);

  const draftAged = stuckDrafts.some((s) => now - new Date(s.createdAt).getTime() >= STALE_MS);
  const nodeNeedsPush = dueSoonNodes.length > 0 && now - lastMemberAt >= AGENT_QUIET_MS;
  if (!((stale && unfinished) || draftAged || nodeNeedsPush)) return;

  const taskWithMembers = await prisma.task.findUnique({
    where: { id: task.id },
    include: { members: { include: { user: true } }, user: true }
  });
  const parties = [
    { userId: taskWithMembers.userId, name: displayName(taskWithMembers.user) },
    ...taskWithMembers.members.map((m) => ({ userId: m.userId, name: displayName(m.user) }))
  ].filter((p, idx, arr) => arr.findIndex((x) => x.userId === p.userId) === idx);

  // 先尝试扣点走 LLM 推动；余额不足则模板推动（不扣点、不失败）
  let content;
  let usedLLM = false;
  try {
    await assertAICredits(taskWithMembers.userId, COST(), "collab_agent");
    const snapshot = await loadSpaceSnapshot(taskWithMembers);
    const system = buildSystem(collab.scenario, collab.agent);
    const prompt = `${formatSpaceData(taskWithMembers, snapshot)}\n\n你是这个空间的推动者。空间进展停滞了：成员已有一段时间没有新发言，或有草案久未确认 / 节点临近。请写一条「推动消息」发到讨论：\n1. 自然点名相关成员（${parties.map((p) => p.name).join("、")}），指出卡住的具体事项（待确认草案、临期节点、久未推进的子约定）；\n2. 给出可立刻执行的下一步建议（谁、做什么、什么时候前）；\n3. 语气鼓励、不指责、不评判对错；200 字以内；不要用"Agent："开头。`;
    const result = await callKimiChat({
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      temperature: 0.5,
      maxTokens: 1200,
      fetchTimeout: 35000
    });
    if (result?.content?.trim()) {
      content = result.content.trim().slice(0, 2000);
      usedLLM = true;
      try {
        await chargeAICredits({ userId: taskWithMembers.userId, cost: COST(), feature: "collab_agent", description: "协同约定 Agent：主动推动" });
      } catch (error) {
        if (error?.code === "INSUFFICIENT_CREDITS") console.warn("[collabNudge] 结算余额不足，放行");
        else console.error("[collabNudge] 结算失败:", error?.message || error);
      }
    }
  } catch (error) {
    console.warn(`[collabNudge] LLM 推动失败（${task.id}），退回模板:`, error?.message || error);
  }
  if (!content) content = fallbackNudge({ task: taskWithMembers, members: parties, stuckDrafts, dueSoonNodes });

  await postAgentMessage(task.id, {
    content,
    topic: "推进",
    parentId: null
  });
  // mentions 仅落库供前端高亮，不改表结构：写入最新一条 agent 消息的 mentions
  const posted = await prisma.comment.findFirst({ where: { taskId: task.id, agent: true }, orderBy: { createdAt: "desc" } });
  if (posted) await prisma.comment.update({ where: { id: posted.id }, data: { mentions: parties.map((p) => p.userId) } });

  for (const p of parties) {
    await prisma.notification.create({
      data: {
        userId: p.userId,
        title: "协同约定：Agent 推动了一下",
        body: `「${taskWithMembers.title}」进展有点慢了，Agent 在讨论里给出了下一步建议。`,
        channel: "in_app",
        status: "SENT",
        payload: { type: "collab_agent_nudge", taskId: task.id, link: `/collabspace?taskId=${task.id}` }
      }
    });
  }

  const nextMeta = {
    ...task.metadata,
    collab: { ...collab, agent: { ...(collab.agent || {}), lastNudgeAt: new Date().toISOString() } }
  };
  await prisma.task.update({ where: { id: task.id }, data: { metadata: nextMeta } });
  await logCollabChange(taskWithMembers.userId, taskWithMembers, "collab_agent_action", [
    { field: "agent_action", field_label: "Agent 动作", new_value: usedLLM ? "nudge" : "nudge(template)" }
  ]);
  console.log(`[collabNudge] pushed task=${task.id} llm=${usedLLM} parties=${parties.length}`);
}

let timer = null;
export function startCollabNudgeSweep() {
  if (process.env.DISABLE_COLLAB_NUDGE === "1") return;
  if (timer) return;
  const run = async () => {
    try {
      const tasks = await prisma.task.findMany({
        where: { deletedAt: null, status: { notIn: ["DONE", "ARCHIVED"] } },
        take: 500
      });
      for (const task of tasks) {
        try {
          await maybeNudgeTask(task);
        } catch (error) {
          console.error(`[collabNudge] task ${task.id} failed:`, error?.message || error);
        }
      }
    } catch (error) {
      console.error("[collabNudge] sweep failed:", error?.message || error);
    }
  };
  timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.();
  // 启动 60s 后先跑一轮（冷启动兜底）
  setTimeout(run, 60 * 1000).unref?.();
  console.log("[collabNudge] sweep started, interval", SWEEP_INTERVAL_MS / 60000, "min");
}
