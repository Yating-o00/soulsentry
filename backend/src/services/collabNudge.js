// 协同约定的「主动推动」轮询：空间停滞时，Agent 主动出现推进事件。
// 触发信号（满足其一且冷却期过后）：成员 ≥24h 无发言且有未决事项；草案 ≥24h 未确认；
// 节点 48h 内到期且 ≥12h 无成员发言。Agent 以讨论消息 + 站内通知推动相关成员，幂等防刷屏。
import { prisma } from "../lib/prisma.js";
import { assertAICredits, chargeAICredits } from "./aiCredits.js";
import { AI_CALL_COSTS } from "../config/aiCosts.js";
import { collectSubtasks, logCollabChange } from "./collabSpace.js";
import { buildSystem, formatSpaceData, loadSpaceSnapshot, postAgentMessage } from "./collabAgent.js";
import { callKimiChat } from "../lib/kimi.js";
import { loadOwnerBuddyPersona } from "./buddyPersona.js";

const STALE_MS = 24 * 3600 * 1000;       // 成员多久没发言算停滞
const NODE_WINDOW_MS = 48 * 3600 * 1000; // 节点临期窗口
const AGENT_QUIET_MS = 12 * 3600 * 1000; // Agent 自己刚说过话就闭嘴
const NUDGE_COOLDOWN_MS = 48 * 3600 * 1000; // 同一空间推动冷却：不每天催，至少隔两天
const REPLY_REMINDER_MS = Number(process.env.COLLAB_REPLY_REMINDER_HOURS || 4) * 3600 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const NUDGE_TOPICS = new Set(["推进", "提醒"]);

const COST = () => AI_CALL_COSTS.collab_agent || 2;

function displayName(u) {
  return u?.displayName || u?.email || u?.phone || "成员";
}

// 模板兜底：LLM 不可用/余额不足时也能推动（不扣点），同样带一点人格语气
function fallbackNudge({ task, members, stuckDrafts, dueSoonNodes, persona }) {
  const names = members.map((m) => m.name).join("、");
  const opener =
    persona === "strict"
      ? `@${names} 「${task.title}」该往前推了。先对齐卡点，再定负责人和时间：`
      : persona === "buddy"
        ? `@${names} 来，我们把「${task.title}」往前拱一步：`
        : `@${names} 我们的「${task.title}」有一会儿没有新进展了，不用急，一起往前挪一小步：`;
  const lines = [opener];
  if (stuckDrafts.length > 0) lines.push(`「${stuckDrafts[0].title}」还差一个确认，谁方便先看一眼？`);
  if (dueSoonNodes.length > 0) lines.push(`节点「${dueSoonNodes[0].title}」快到了，我们定个时间？`);
  if (stuckDrafts.length === 0 && dueSoonNodes.length === 0) lines.push("在讨论里说一句最新进展就好，或者 @我 帮你整理下一步。");
  lines.push("看到回一句就行，不着急。");
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

  const lastAgentWasNudge = Boolean(lastAgentComment && NUDGE_TOPICS.has(lastAgentComment.topic));
  const memberRepliedAfterAgent = Boolean(
    lastMemberComment && lastAgentComment && lastMemberComment.createdAt > lastAgentComment.createdAt
  );
  // 已经推动/提醒过且无人回应：保持安静，等成员回应后再继续
  if (lastAgentWasNudge && !memberRepliedAfterAgent) return;

  // Agent 刚 @ 过具体成员、但一直没人回应：沉默过久只补一次提醒
  if (
    lastAgentComment &&
    !lastAgentWasNudge &&
    Array.isArray(lastAgentComment.mentions) &&
    lastAgentComment.mentions.length > 0 &&
    !memberRepliedAfterAgent &&
    now - lastAgentComment.createdAt.getTime() >= REPLY_REMINDER_MS
  ) {
    const taskWithMembers = await prisma.task.findUnique({
      where: { id: task.id },
      include: { members: { include: { user: true } }, user: true }
    });
    const nameById = new Map(
      [taskWithMembers?.user, ...(taskWithMembers?.members || []).map((m) => m.user)]
        .filter(Boolean)
        .map((u) => [u.id, displayName(u)])
    );
    const names = lastAgentComment.mentions.map((id) => nameById.get(id)).filter(Boolean);
    const prefix = names.length > 0 ? `${names.map((name) => `@${name}`).join(" ")} ` : "";
    const content = `${prefix}提醒一下：上一条里的下一步还在等大家回应。方便时回一句「可以」或「需要调整」，心栈再继续推进。`;
    await postAgentMessage(task.id, {
      content,
      topic: "提醒",
      parentId: lastAgentComment.parentId || lastAgentComment.id,
      mentions: lastAgentComment.mentions
    });
    await prisma.task.update({
      where: { id: task.id },
      data: {
        metadata: {
          ...(task.metadata || {}),
          collab: { ...collab, agent: { ...agentMeta, lastNudgeAt: new Date().toISOString() } }
        }
      }
    });
    console.log(`[collabNudge] reminded task=${task.id} mentioned=${lastAgentComment.mentions.length}`);
    return;
  }

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

  // 空间状态没变就不要重复同一条推动：卡住的草案/临近节点还是同一批时，
  // 七天内不再发一模一样的提醒，避免像每天催促成员。
  const nudgeSignature = JSON.stringify({
    drafts: stuckDrafts.map((s) => s.title).sort(),
    nodes: dueSoonNodes.map((n) => n.title).sort(),
  });
  const lastNudgeAt = agentMeta.lastNudgeAt ? new Date(agentMeta.lastNudgeAt).getTime() : 0;
  if (agentMeta.lastNudgeSignature === nudgeSignature && lastNudgeAt && now - lastNudgeAt < 7 * 86400000) {
    return;
  }

  const taskWithMembers = await prisma.task.findUnique({
    where: { id: task.id },
    include: { members: { include: { user: true } }, user: true }
  });
  const parties = [
    { userId: taskWithMembers.userId, name: displayName(taskWithMembers.user) },
    ...taskWithMembers.members.map((m) => ({ userId: m.userId, name: displayName(m.user) }))
  ].filter((p, idx, arr) => arr.findIndex((x) => x.userId === p.userId) === idx);

  // 先尝试扣点走 LLM 推动；余额不足则模板推动（不扣点、不失败）
  // 协同创建者在这颗搭子下的人格，决定推动消息的表达方式
  const ownerPersona = await loadOwnerBuddyPersona({
    prisma,
    userId: taskWithMembers.userId,
    buddyId: taskWithMembers.metadata?._extraFields?.buddy_id || null,
  });
  let content;
  let usedLLM = false;
  try {
    await assertAICredits(taskWithMembers.userId, COST(), "collab_agent");
    const snapshot = await loadSpaceSnapshot(taskWithMembers);
    const system = buildSystem(collab.scenario, collab.agent, ownerPersona);
    const prompt = `${formatSpaceData(taskWithMembers, snapshot)}\n\n你是这个空间的推动者。空间进展停滞了：成员已有一段时间没有新发言，或有草案久未确认 / 节点临近。请写一条「推动消息」发到讨论：\n1. 自然点名相关成员（${parties.map((p) => p.name).join("、")}），指出卡住的具体事项（待确认草案、临期节点、久未推进的子约定）；\n2. 只给一个最小的下一步（谁、做什么，必要时说什么时候），说完就停；不说「你们怎么还没…」，不列罪状、不连问；\n3. 表达方式严格遵循 system 里的人格设定（严格但不指责、温柔但不催促、战友但不轻佻）；不评判对错；像朋友发一条微信，120 字以内；不要用"Agent："开头。`;
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
  if (!content) content = fallbackNudge({ task: taskWithMembers, members: parties, stuckDrafts, dueSoonNodes, persona: ownerPersona });

  await postAgentMessage(task.id, {
    content,
    topic: "推进",
    parentId: null,
    // 明确点名全体参与方：postAgentMessage 会落库 mentions 并逐个发站内通知
    mentions: parties.map((p) => p.userId)
  });

  const nextMeta = {
    ...task.metadata,
    collab: { ...collab, agent: { ...(collab.agent || {}), lastNudgeAt: new Date().toISOString(), lastNudgeSignature: nudgeSignature } }
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
