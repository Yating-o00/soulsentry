// 协同约定「带待办的邀请」链路：
// 创建邀请（绑定具体子约定 + Agent 生成 30 秒前情摘要）→ 受邀者落地页（公开）→ 三种回应
// 接受分工=加入成员并成为绑定子约定负责人；提出建议=留言进共同讨论；暂时无法参与=仅记录回应。
// 另含「一键复用模板」：副本只继承结构（子约定树/执行节点/成员），重置确认与完成状态，不带历史。
import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { assertTaskAccess, notifyTaskParties } from "../services/taskSharing.js";
import { collectSubtasks, logCollabChange } from "../services/collabSpace.js";
import { syncParentProgress } from "./tasks.js";
import { loadSpaceSnapshot, buildSystem, postAgentMessage } from "../services/collabAgent.js";
import { callKimiChat } from "../lib/kimi.js";
import { assertAICredits, chargeAICredits } from "../services/aiCredits.js";
import { AI_CALL_COSTS } from "./functions.js";

export const collabInviteRouter = Router();

const COST = () => AI_CALL_COSTS.collab_agent || 2;
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const actorName = (user) => user?.displayName || user?.email || user?.phone || "成员";

function parseSubtaskIds(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const serializeInvite = (invite) => ({
  id: invite.id,
  code: invite.code,
  invitee_name: invite.inviteeName,
  subtask_ids: parseSubtaskIds(invite.subtaskIds),
  note: invite.note,
  status: invite.status,
  response_msg: invite.responseMsg,
  responded_at: invite.respondedAt,
  created_date: invite.createdAt
});

// 访问校验 + 协同开关校验；失败时已响应，返回 null（与 collab.js 同口径）
async function loadCollabSpace(req, res) {
  const result = await assertTaskAccess(req, res, req.params.taskId);
  if (!result) return null;
  const collab = result.task.metadata?.collab;
  if (!collab || typeof collab !== "object") {
    res.status(403).json({ error: "COLLAB_NOT_ENABLED", message: "该约定未开启协同空间" });
    return null;
  }
  return result;
}

// Agent 30 秒前情摘要：失败不阻断邀请创建（返回空串，落地页显示兜底文案）
async function generateInviteSummary({ task, user }) {
  if (process.env.COLLAB_AGENT_MOCK_LLM === "1") {
    return "（本地 mock）这是一次协同约定的邀请：成员们已经在讨论中形成了一些共识，邀请你加入并认领与自己相关的待办。";
  }
  try {
    await assertAICredits(user.id, COST(), "collab_agent");
  } catch {
    return "";
  }
  try {
    const snapshot = await loadSpaceSnapshot(task);
    const system = buildSystem(task.metadata?.collab?.scenario, task.metadata?.collab?.agent);
    const collab = task.metadata?.collab || {};
    const memberNames = [task.user, ...task.members.map((m) => m.user)]
      .filter(Boolean).map((u) => actorName(u));
    const activeItems = snapshot.subtasks.filter((s) => s.status !== "DONE").slice(0, 8)
      .map((s) => `- ${s.title}`).join("\n") || "（暂无）";
    const nextNode = snapshot.nodes.find((n) => !n.doneAt);
    const prompt = `约定主题：${task.title}
共同目标：${collab.goal || "（未填写）"}
成员：${[...new Set(memberNames)].join("、")}
当前推进中的事项：
${activeItems}
下一执行节点：${nextNode ? nextNode.title : "（暂无）"}

请为即将受邀加入的新成员写一段「30 秒前情摘要」（120 字以内）：让 TA 快速明白这个约定在做什么、目前进展到哪、加入后大概要做什么。口吻亲切、信息密度高，不要客套话。只输出摘要正文。`;
    const result = await callKimiChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      maxTokens: 500,
      fetchTimeout: 30000
    });
    const text = String(result?.content || "").trim().slice(0, 500);
    try {
      await chargeAICredits({ userId: user.id, cost: COST(), feature: "collab_agent", description: "协同邀请前情摘要" });
    } catch (error) {
      console.warn("[collabInvite] 摘要结算失败（放行）:", error?.message || error);
    }
    return text;
  } catch (error) {
    console.warn("[collabInvite] 前情摘要生成失败（邀请照常创建）:", error?.message || error);
    return "";
  }
}

// POST /api/collab/:taskId/invites — 创建带待办的邀请
const createInviteSchema = z.object({
  invitee_name: z.string().trim().min(1).max(30),
  subtask_ids: z.array(z.string()).max(20).default([]),
  note: z.string().max(200).optional().nullable()
});

collabInviteRouter.post("/collab/:taskId/invites", requireAuth, async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = createInviteSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const subtasks = await collectSubtasks(task.id);
  const idSet = new Set(subtasks.map((s) => s.id));
  const boundIds = payload.data.subtask_ids.filter((id) => idSet.has(id)).slice(0, 20);

  const summary = await generateInviteSummary({ task, user: req.user });
  const invite = await prisma.collabInvite.create({
    data: {
      taskId: task.id,
      code: crypto.randomBytes(9).toString("base64url"),
      inviterId: req.user.id,
      inviteeName: payload.data.invitee_name.trim(),
      subtaskIds: JSON.stringify(boundIds),
      note: payload.data.note?.trim() || null,
      summary: summary || null
    }
  });

  await logCollabChange(req.user.id, task, "collab_invite_created", [
    { field: "invitee", field_label: "受邀者", new_value: invite.inviteeName },
    { field: "todos", field_label: "绑定待办", new_value: `${boundIds.length} 项` }
  ]);

  return res.status(201).json({ invite: serializeInvite(invite), url: `/invite/${invite.code}` });
});

// GET /api/collab/:taskId/invites — 最近邀请及回应状态
collabInviteRouter.get("/collab/:taskId/invites", requireAuth, async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const invites = await prisma.collabInvite.findMany({
    where: { taskId: result.task.id },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  return res.json({ invites: invites.map(serializeInvite) });
});

// GET /api/invite/:code — 受邀者落地页数据（公开，登录用户附带自身状态）
collabInviteRouter.get("/invite/:code", optionalAuth, async (req, res) => {
  const invite = await prisma.collabInvite.findUnique({
    where: { code: req.params.code },
    include: { task: { include: { members: { include: { user: true } }, user: true } } }
  });
  if (!invite || !invite.task?.metadata?.collab) {
    return res.status(404).json({ error: "NOT_FOUND", message: "邀请不存在或已失效" });
  }
  const task = invite.task;
  const collab = task.metadata.collab;
  const [snapshot, consensusDoc] = await Promise.all([
    loadSpaceSnapshot(task),
    prisma.collabDoc.findFirst({ where: { taskId: task.id, docType: "consensus" }, orderBy: { updatedAt: "desc" } })
  ]);
  const boundIds = new Set(parseSubtaskIds(invite.subtaskIds));
  const todos = snapshot.subtasks.filter((s) => boundIds.has(s.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      standard: s.metadata?.collab?.standard || "",
      done: s.status === "DONE"
    }));
  const memberIds = new Set([task.userId, ...task.members.map((m) => m.userId)]);
  return res.json({
    invite: serializeInvite(invite),
    pact: {
      title: task.title,
      goal: collab.goal || "",
      scenario: collab.scenario || "custom",
      member_count: memberIds.size
    },
    summary: invite.summary || "",
    consensus: consensusDoc ? String(consensusDoc.content || "").slice(0, 800) : "",
    progressing: snapshot.subtasks.filter((s) => s.status !== "DONE" && s.metadata?.collab?.state !== "draft").slice(0, 5)
      .map((s) => ({ id: s.id, title: s.title })),
    next_node: (() => { const n = snapshot.nodes.find((x) => !x.doneAt); return n ? { title: n.title } : null; })(),
    todos,
    viewer: req.user
      ? { is_member: memberIds.has(req.user.id), responded: invite.respondedBy === req.user.id, status: invite.status }
      : null
  });
});

// POST /api/invite/:code/respond — 三种回应：accept（加入+负责）/ suggest（留言进讨论）/ decline（仅记录）
const respondSchema = z.object({
  action: z.enum(["accept", "suggest", "decline"]),
  message: z.string().max(500).optional().nullable()
});

collabInviteRouter.post("/invite/:code/respond", requireAuth, async (req, res) => {
  const payload = respondSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const invite = await prisma.collabInvite.findUnique({
    where: { code: req.params.code },
    include: { task: { include: { members: true } } }
  });
  if (!invite || !invite.task?.metadata?.collab) {
    return res.status(404).json({ error: "NOT_FOUND", message: "邀请不存在或已失效" });
  }
  if (invite.status !== "open" && invite.respondedBy !== req.user.id) {
    return res.status(409).json({ error: "ALREADY_RESPONDED", message: "该邀请已被回应" });
  }
  const task = invite.task;
  const action = payload.data.action;
  const message = payload.data.message?.trim() || "";
  if (action === "suggest" && !isNonEmptyString(message)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "请先写下你的建议" });
  }

  const status = action === "accept" ? "accepted" : action === "suggest" ? "suggested" : "declined";
  const updated = await prisma.collabInvite.update({
    where: { id: invite.id },
    data: { status, responseMsg: message || null, respondedBy: req.user.id, respondedAt: new Date() }
  });

  if (action === "accept") {
    // 加入成员（发起人除外）+ 成为绑定子约定的负责人
    if (task.userId !== req.user.id) {
      await prisma.taskMember.upsert({
        where: { taskId_userId: { taskId: task.id, userId: req.user.id } },
        create: { taskId: task.id, userId: req.user.id, invitedBy: invite.inviterId },
        update: {}
      });
    }
    const boundIds = parseSubtaskIds(invite.subtaskIds);
    for (const subId of boundIds) {
      const sub = await prisma.task.findFirst({ where: { id: subId, parentTaskId: task.id } });
      if (!sub) continue;
      const meta = sub.metadata?.collab || {};
      await prisma.task.update({
        where: { id: sub.id },
        data: { metadata: { ...(sub.metadata || {}), collab: { ...meta, assignee: req.user.id } } }
      });
    }
    await logCollabChange(req.user.id, task, "collab_invite_accepted", [
      { field: "invitee", field_label: "受邀者", new_value: actorName(req.user) },
      { field: "todos", field_label: "认领待办", new_value: `${boundIds.length} 项` }
    ]);
    await notifyTaskParties(task, req.user, {
      type: "collab_invite_accepted",
      title: "新伙伴加入协同约定",
      body: `${actorName(req.user)} 接受了「${task.title}」的邀请，认领了 ${boundIds.length} 项待办`
    });
  } else if (action === "suggest") {
    await prisma.comment.create({
      data: {
        taskId: task.id,
        userId: req.user.id,
        content: `【邀请回应·建议】${message}`,
        mentions: [],
        topic: "邀请回应"
      }
    });
    await logCollabChange(req.user.id, task, "collab_invite_suggested", [
      { field: "invitee", field_label: "受邀者", new_value: actorName(req.user) }
    ]);
    await notifyTaskParties(task, req.user, {
      type: "collab_invite_suggested",
      title: "邀请对象提出了建议",
      body: `${actorName(req.user)} 对「${task.title}」的邀请给出了建议，请到共同讨论查看`
    });
  } else {
    await logCollabChange(req.user.id, task, "collab_invite_declined", [
      { field: "invitee", field_label: "受邀者", new_value: actorName(req.user) }
    ]);
  }

  return res.json({ invite: serializeInvite(updated) });
});

// POST /api/collab/:taskId/reuse — 一键复用模板：结构继承、状态重置、不带历史
collabInviteRouter.post("/collab/:taskId/reuse", requireAuth, async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const collab = task.metadata.collab;

  const copy = await prisma.task.create({
    data: {
      userId: req.user.id,
      title: `${task.title} · 延续`,
      description: task.description,
      status: "TODO",
      priority: task.priority || "medium",
      category: "collab",
      metadata: {
        ...(task.metadata || {}),
        collab: {
          scenario: collab.scenario,
          goal: collab.goal || "",
          confirmRule: collab.confirmRule === "owner" ? "owner" : "all",
          agent: { enabled: collab.agent?.enabled !== false, paused: false, ...(collab.agent?.templateId ? { templateId: collab.agent.templateId, templateName: collab.agent.templateName, templateDomain: collab.agent.templateDomain } : {}) }
        }
      }
    }
  });

  // 成员：保留原班人马（复用副本没有「邀请」概念的历史，受邀成员直接保留）
  const memberships = await prisma.taskMember.findMany({ where: { taskId: task.id } });
  for (const m of memberships) {
    if (m.userId === req.user.id) continue;
    await prisma.taskMember.create({
      data: { taskId: copy.id, userId: m.userId, invitedBy: req.user.id }
    }).catch(() => {});
  }

  // 子约定树：结构/标题/完成标准/负责人保留，确认与完成状态全部重置
  const subs = await collectSubtasks(task.id);
  const idMap = new Map([[task.id, copy.id]]);
  const pending = [...subs];
  let guard = 0;
  while (pending.length > 0 && guard < 200) {
    guard += 1;
    for (let i = pending.length - 1; i >= 0; i--) {
      const s = pending[i];
      const parentNewId = idMap.get(s.parentTaskId);
      if (!parentNewId) continue;
      const meta = s.metadata?.collab || {};
      const created = await prisma.task.create({
        data: {
          userId: req.user.id,
          title: s.title,
          status: "TODO",
          priority: s.priority || "medium",
          parentTaskId: parentNewId,
          metadata: {
            collab: {
              state: meta.state === "draft" ? "draft" : "active",
              standard: meta.standard || "",
              assignee: meta.assignee || null,
              confirmedBy: [],
              rejectedBy: [],
              assigneeHint: meta.assigneeHint || ""
            }
          }
        }
      });
      idMap.set(s.id, created.id);
      pending.splice(i, 1);
    }
  }

  // 执行节点：归口结构保留，完成状态重置
  const nodes = await prisma.collabNode.findMany({ where: { taskId: task.id }, orderBy: { sortOrder: "asc" } });
  const nodeMap = new Map();
  for (const n of nodes) {
    if (n.parentId && !nodeMap.has(n.parentId)) continue; // 父节点未处理则跳过（理论上 sortOrder 保证父先）
    const created = await prisma.collabNode.create({
      data: {
        taskId: copy.id,
        title: n.title,
        nodeType: n.nodeType,
        sortOrder: n.sortOrder,
        createdBy: req.user.id,
        parentId: n.parentId ? nodeMap.get(n.parentId) : null
      }
    });
    nodeMap.set(n.id, created.id);
  }

  await syncParentProgress(copy.id);
  await logCollabChange(req.user.id, copy, "collab_reused", [
    { field: "from", field_label: "复用自", new_value: task.title },
    { field: "subtasks", field_label: "子约定", new_value: `${subs.length} 项` }
  ]);

  return res.status(201).json({ task_id: copy.id, title: copy.title });
});

// 兼容：部分部署直接以 /api 前缀挂载本路由时去掉前缀（ mounted at /api 时路径已含 invite/collab 前缀）
export const inviteApiRouter = collabInviteRouter;
