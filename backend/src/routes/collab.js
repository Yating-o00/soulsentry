// 协同约定空间路由：成员 / 执行节点 / 沉淀文档 / 子约定确认 / 讨论 / 转换 / 动态 / Agent
// 统一前置：requireAuth + assertTaskAccess + 任务已开启协同（metadata.collab）
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { rejectIfRisky } from "../services/contentSecurity.js";
import { assertTaskAccess, notifyTaskParties, notifyMentions } from "../services/taskSharing.js";
import { serializeTask, syncParentProgress } from "./tasks.js";
import { serializeComment } from "./comments.js";
import { runCollabAgent, postAgentMessage, cascadeNodeCompletion } from "../services/collabAgent.js";
import { scheduleCollabDrive } from "../services/collabDrive.js";
import { collectSubtasks, logCollabChange, nestSubtasks } from "../services/collabSpace.js";
import { AGENT_DOMAINS, AGENT_TEMPLATES, findAgentTemplate } from "../services/agentStore.js";
import { normalizeAgentSettings, normalizeCustomRule, parseCustomRuleWithAI, sendCollabWelcome } from "../services/collabAutomation.js";
import { BUDDY_NAMES } from "./buddies.js";

export const collabRouter = Router();

collabRouter.use(requireAuth);

const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid datetime" });

const serializeNode = (node) => ({
  id: node.id,
  task_id: node.taskId,
  title: node.title,
  node_type: node.nodeType,
  due_at: node.dueAt,
  done_at: node.doneAt,
  sort_order: node.sortOrder,
  created_by: node.createdBy,
  agent_done: node.agentDone || false,
  parent_id: node.parentId || null,
  auto_done: node.autoDone || false,
  created_date: node.createdAt
});

const serializeDoc = (doc) => ({
  id: doc.id,
  task_id: doc.taskId,
  user_id: doc.userId,
  title: doc.title,
  doc_type: doc.docType,
  content: doc.content,
  version: doc.version,
  history: doc.history || [],
  status: doc.status,
  agent_confirmed: doc.agentConfirmed || false,
  source_comment_id: doc.sourceCommentId,
  created_date: doc.createdAt,
  updated_date: doc.updatedAt
});

const serializeActivity = (log) => ({
  id: log.id,
  task_id: log.taskId,
  parent_task_id: log.parentTaskId,
  change_type: log.changeType,
  task_title: log.taskTitle,
  changed_fields: log.changedFields || [],
  changes_detail: log.changesDetail || [],
  user_id: log.userId,
  display_name: log.user?.displayName || log.user?.email || log.user?.phone || "",
  created_date: log.createdAt
});

function actorName(user) {
  return user?.displayName || user?.email || user?.phone || "对方";
}

// 访问校验 + 协同开关校验；失败时已响应，返回 null
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

function flattenSubtasks(nodes) {
  const out = [];
  const walk = (list) => {
    for (const node of list) {
      out.push(node);
      walk(node.children || []);
    }
  };
  walk(nodes);
  return out;
}

function serializeSubtaskTree(nodes) {
  return nodes.map((node) => ({
    ...serializeTask(node),
    children: serializeSubtaskTree(node.children || [])
  }));
}

// GET /api/collab/:taskId/summary — 空间聚合：任务、成员、子约定树（全部层级）、节点、文档、统计、最近动态
// GET /api/collab/invite-candidates?q=&task_id= - @邀请候选
// 候选范围 = 与我协作过的人（我发起的约定的成员 + 我作为成员参与的约定的发起人），排除当前约定已有成员与本人
collabRouter.get("/invite-candidates", async (req, res) => {
  const me = req.user.id;
  const q = String(req.query.q || "").trim().toLowerCase();
  const taskId = String(req.query.task_id || "");

  if (taskId) {
    const result = await assertTaskAccess(req, res, taskId);
    if (!result) return;
  }

  try {
    const [myTaskMembers, myMemberships] = await Promise.all([
      prisma.taskMember.findMany({ where: { task: { userId: me } }, include: { user: true }, take: 200 }),
      prisma.taskMember.findMany({ where: { userId: me }, include: { task: { include: { user: true } } }, take: 200 })
    ]);
    const byId = new Map();
    for (const m of myTaskMembers) {
      if (m.user && m.userId !== me) byId.set(m.userId, m.user);
    }
    for (const m of myMemberships) {
      if (m.task?.user && m.task.userId !== me) byId.set(m.task.userId, m.task.user);
    }
    let users = [...byId.values()];

    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId }, include: { members: true } });
      if (task) {
        const exclude = new Set([me, task.userId, ...task.members.map((m) => m.userId)]);
        users = users.filter((u) => !exclude.has(u.id));
      }
    }
    if (q) {
      users = users.filter((u) =>
        (u.displayName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      );
    }
    users = users.slice(0, 6);

    return res.json({
      candidates: users.map((u) => ({
        user_id: u.id,
        display_name: u.displayName || u.email || "用户",
        email: u.email || null
      }))
    });
  } catch (error) {
    console.error("[collab] invite-candidates failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});

// ── Agent 市场 ──
// GET /api/collab/agent-store — 专业 Agent 方案目录（法律/旅行/教育等），无需 task 上下文
collabRouter.get("/agent-store", async (req, res) => {
  return res.json({ domains: AGENT_DOMAINS, templates: AGENT_TEMPLATES });
});

// POST /api/collab/:taskId/agent — 为当前空间启用/更换专业 Agent 方案（template_id 传 null 恢复默认）
const agentTemplateSchema = z.object({
  template_id: z.string().max(64).nullable().optional()
});

collabRouter.post("/:taskId/agent", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = agentTemplateSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const templateId = payload.data.template_id || null;
  const template = templateId ? findAgentTemplate(templateId) : null;
  if (templateId && !template) {
    return res.status(400).json({ error: "UNKNOWN_TEMPLATE", message: "Agent 市场里不存在该方案" });
  }

  const collab = task.metadata?.collab || {};
  const agent = { ...(collab.agent || { enabled: true }) };
  if (template) {
    agent.templateId = template.id;
    agent.templateName = template.name;
    agent.templateDomain = template.domain;
  } else {
    delete agent.templateId;
    delete agent.templateName;
    delete agent.templateDomain;
  }
  const metadata = { ...(task.metadata || {}), collab: { ...collab, agent } };
  await prisma.task.update({ where: { id: task.id }, data: { metadata } });

  await logCollabChange(req.user.id, task, "collab_agent_template", [
    { field: "agent_template", field_label: "Agent 方案", new_value: template ? `${template.name}（${template.domain}）` : "恢复默认 Agent" }
  ]);

  return res.json({ agent, template });
});

// PATCH /api/collab/:taskId/agent-settings — 自定义空间 Agent：欢迎语 / 每日打卡公布 / 沟通语言
const agentSettingsSchema = z.object({
  language: z.enum(["auto", "zh", "en", "ja", "es", "fr"]).optional(),
  welcome: z.object({
    enabled: z.boolean().optional(),
    template: z.string().max(800).optional(),
  }).optional(),
  checkinDigest: z.object({
    enabled: z.boolean().optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式需为 HH:MM").optional(),
    mentionMissing: z.boolean().optional(),
  }).optional(),
  customRules: z.array(z.object({
    id: z.string().max(60).optional(),
    name: z.string().trim().min(1).max(24),
    enabled: z.boolean().optional(),
    mode: z.enum(["schedule", "instruction"]),
    frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    weekday: z.number().int().min(1).max(7).optional(),
    day: z.number().int().min(1).max(31).optional(),
    condition: z.string().max(300).optional(),
    instruction: z.string().trim().min(1).max(600),
    language: z.enum(["auto", "zh", "en", "ja", "es", "fr"]).optional(),
    createdAt: z.string().optional(),
    sourceText: z.string().max(600).optional(),
  })).max(10).optional(),
});

collabRouter.patch("/:taskId/agent-settings", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  if (task.userId !== req.user.id) {
    return res.status(403).json({ error: "FORBIDDEN", message: "只有协同发起人可以修改 Agent 自动化设置" });
  }
  const payload = agentSettingsSchema.safeParse(req.body || {});
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", message: payload.error.issues?.[0]?.message || "设置格式不正确" });
  }
  const collab = task.metadata?.collab || {};
  const agent = { ...(collab.agent || { enabled: true }) };
  const current = normalizeAgentSettings(agent);
  const nextSettings = {
    ...current,
    ...(payload.data.language ? { language: payload.data.language } : {}),
    welcome: { ...current.welcome, ...(payload.data.welcome || {}) },
    checkinDigest: { ...current.checkinDigest, ...(payload.data.checkinDigest || {}) },
    customRules: current.customRules,
  };
  nextSettings.welcome.template = String(nextSettings.welcome.template || "").slice(0, 800);
  nextSettings.checkinDigest.time = String(nextSettings.checkinDigest.time || "21:00");
  if (payload.data.customRules) {
    const existingById = new Map(current.customRules.map((rule) => [rule.id, rule]));
    nextSettings.customRules = payload.data.customRules
      .map((rule, index) => normalizeCustomRule({ ...(existingById.get(rule.id) || {}), ...rule }, index))
      .filter(Boolean)
      .slice(0, 10);
  }
  const nextAgent = { ...agent, settings: nextSettings };
  const metadata = { ...(task.metadata || {}), collab: { ...collab, agent: nextAgent } };
  await prisma.task.update({ where: { id: task.id }, data: { metadata } });

  await logCollabChange(req.user.id, task, "collab_agent_settings", [
    {
      field: "agent_automation",
      field_label: "Agent 自动化",
      new_value: `欢迎语${nextSettings.welcome.enabled ? "开" : "关"}；每日打卡${nextSettings.checkinDigest.enabled ? ` ${nextSettings.checkinDigest.time}` : "关"}；语言 ${nextSettings.language}`,
    },
  ]);
  return res.json({ agent: nextAgent, settings: nextSettings });
});

// POST /api/collab/:taskId/agent-rules/parse — 自然语言编译为一条自定义功能（仅返回规则，保存仍走 agent-settings）
collabRouter.post("/:taskId/agent-rules/parse", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  if (task.userId !== req.user.id) {
    return res.status(403).json({ error: "FORBIDDEN", message: "只有协同发起人可以添加 Agent 功能" });
  }
  const text = String(req.body?.text || "").trim().slice(0, 600);
  if (!text) return res.status(400).json({ error: "INVALID_INPUT", message: "请描述希望 Agent 做什么" });
  const settings = normalizeAgentSettings(task.metadata?.collab?.agent || {});
  try {
    const rule = await parseCustomRuleWithAI(text, { task, settings });
    if (!rule) return res.status(400).json({ error: "INVALID_RULE", message: "这句话还没法变成一条功能，再具体一点？" });
    return res.json({ rule });
  } catch (error) {
    console.error("[collab] agent-rule parse failed:", error?.message || error);
    return res.status(500).json({ error: "PARSE_FAILED", message: "暂时解析不了，再试一次或换个说法" });
  }
});

// POST /api/collab/:taskId/welcome — 成员第一次进入空间时发送入群欢迎语（后端幂等，不扣 AI 点数）
collabRouter.post("/:taskId/welcome", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  try {
    const welcome = await sendCollabWelcome(result.task.id, req.user.id);
    return res.json(welcome);
  } catch (error) {
    console.error("[collab] welcome failed:", error?.message || error);
    return res.status(500).json({ error: "WELCOME_FAILED", message: "欢迎语暂时没发出去" });
  }
});

// POST /api/collab/:taskId/topics — 新建讨论主题（聊天窗口）
// 主题持久化在 metadata.collab.topics，空主题也能保留；消息通过 comment.topic 归属主题
const topicSchema = z.object({
  name: z.string().trim().min(1).max(20)
});

collabRouter.post("/:taskId/topics", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = topicSchema.safeParse(req.body || {});
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "主题名需为 1-20 个字符" });
  }
  const name = payload.data.name.replace(/\s+/g, " ").trim();
  if (!name) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "主题名不能为空" });
  }
  const collab = task.metadata?.collab || {};
  const current = Array.isArray(collab.topics)
    ? collab.topics.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 20)
    : [];
  if (current.includes(name)) {
    return res.json({ topics: current, name });
  }
  if (current.length >= 20) {
    return res.status(400).json({ error: "TOO_MANY_TOPICS", message: "最多创建 20 个主题" });
  }
  const topics = [...current, name];
  await prisma.task.update({
    where: { id: task.id },
    data: { metadata: { ...(task.metadata || {}), collab: { ...collab, topics } } }
  });
  return res.json({ topics, name });
});

collabRouter.get("/:taskId/summary", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;

  const [memberships, subtasks, nodes, docs, commentMarks, recentLogs] = await Promise.all([
    prisma.taskMember.findMany({ where: { taskId: task.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    collectSubtasks(task.id),
    prisma.collabNode.findMany({ where: { taskId: task.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.collabDoc.findMany({ where: { taskId: task.id }, orderBy: { updatedAt: "desc" } }),
    prisma.comment.findMany({ where: { taskId: task.id }, select: { mark: true } }),
    prisma.taskChangeLog.findMany({
      where: { OR: [{ taskId: task.id }, { parentTaskId: task.id }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: true }
    })
  ]);

  const members = [
    {
      id: null,
      user_id: task.userId,
      display_name: actorName(task.user),
      email: task.user?.email || null,
      phone: task.user?.phone || null,
      avatar: null,
      role: "owner",
      invited_by: null,
      created_date: task.createdAt
    },
    ...memberships.map((m) => ({
      id: m.id,
      user_id: m.userId,
      display_name: actorName(m.user),
      email: m.user?.email || null,
      phone: m.user?.phone || null,
      avatar: null,
      role: "member",
      invited_by: m.invitedBy,
      created_date: m.createdAt
    }))
  ];

  const tree = serializeSubtaskTree(nestSubtasks(task.id, subtasks));
  const flat = flattenSubtasks(tree);
  const nextNode = nodes.find((node) => !node.doneAt) || null;

  return res.json({
    task: serializeTask(task),
    members,
    subtasks: tree,
    nodes: nodes.map(serializeNode),
    docs: docs.map(serializeDoc),
    stats: {
      progress: task.progress,
      next_node: nextNode ? serializeNode(nextNode) : null,
      pending_confirms: flat.filter((item) => item.metadata?.collab?.state === "draft").length,
      dispute_count: commentMarks.filter((c) => c.mark === "dispute").length,
      recent_activity: recentLogs.map(serializeActivity)
    }
  });
});

// POST /api/collab/:taskId/members — owner 按手机号/邮箱添加已注册成员
collabRouter.post("/:taskId/members", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;

  // 协同约定的邀请是协作的基础动作：发起人与其余成员都可邀请（与邀请链接的权限口径一致）
  if (req.user.id !== task.userId) {
    const myMembership = await prisma.taskMember.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: req.user.id } }
    });
    if (!myMembership) {
      return res.status(403).json({ error: "FORBIDDEN", message: "只有约定成员可以邀请协作人员" });
    }
  }
  const schema = z.object({
    phone: z.string().min(3).max(30).optional(),
    email: z.string().email().max(100).optional(),
    user_id: z.string().min(1).max(64).optional()
  }).refine((data) => data.phone || data.email || data.user_id, { message: "user_id、phone 或 email 至少提供一个" });
  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const email = payload.data.email ? payload.data.email.trim().toLowerCase() : undefined;
  const phone = payload.data.phone ? payload.data.phone.trim() : undefined;
  const userId = payload.data.user_id ? payload.data.user_id.trim() : undefined;
  const user = await prisma.user.findFirst({ where: { OR: [{ phone }, { email }, { id: userId }] } });
  if (!user) {
    return res.status(404).json({
      error: "USER_NOT_FOUND",
      hint: "未找到该用户（ID/手机号/邮箱），请确认对方已注册心栈，或通过邀请卡片/链接邀请"
    });
  }
  if (user.id === task.userId) {
    return res.status(409).json({ error: "ALREADY_MEMBER", message: "对方已是约定创建者" });
  }

  const existing = await prisma.taskMember.findUnique({
    where: { taskId_userId: { taskId: task.id, userId: user.id } },
    include: { user: true }
  });
  if (existing) {
    return res.json({
      member: {
        id: existing.id, user_id: existing.userId, display_name: actorName(existing.user),
        email: existing.user?.email || null, phone: existing.user?.phone || null,
        avatar: null, role: "member", invited_by: existing.invitedBy, created_date: existing.createdAt
      },
      already_member: true
    });
  }

  const member = await prisma.taskMember.create({
    data: { taskId: task.id, userId: user.id, invitedBy: req.user.id },
    include: { user: true }
  });

  await notifyTaskParties(task, req.user, {
    type: "collab_member_added",
    title: "协同约定有新成员",
    body: `${actorName(req.user)} 邀请 ${actorName(user)} 加入了协同约定「${task.title}」`
  });
  await logCollabChange(req.user.id, task, "collab_member_added", [
    { field: "member", field_label: "成员", new_value: actorName(user) }
  ]);

  return res.status(201).json({
    member: {
      id: member.id, user_id: member.userId, display_name: actorName(member.user),
      email: member.user?.email || null, phone: member.user?.phone || null,
      avatar: null, role: "member", invited_by: member.invitedBy, created_date: member.createdAt
    },
    already_member: false
  });
});

// DELETE /api/collab/:taskId/members/:userId — 创建者移除协同成员（协同空间口径：记入空间动态）
collabRouter.delete("/:taskId/members/:userId", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;

  if (req.user.id !== task.userId) {
    return res.status(403).json({ error: "FORBIDDEN", message: "只有发起人可以移除协同成员" });
  }
  const targetUserId = String(req.params.userId || "");
  if (!targetUserId || targetUserId === task.userId) {
    return res.status(400).json({ error: "INVALID_TARGET", message: "不能移除发起人" });
  }

  const membership = await prisma.taskMember.findUnique({
    where: { taskId_userId: { taskId: task.id, userId: targetUserId } },
    include: { user: true }
  });
  if (!membership) {
    return res.status(404).json({ error: "NOT_FOUND", message: "该用户不是协同成员" });
  }

  await prisma.taskMember.delete({ where: { id: membership.id } });
  const removedName = actorName(membership.user);

  // 清掉该成员在子约定上的负责人标记，避免移除后仍显示为负责成员
  try {
    const subtasks = await collectSubtasks(task.id);
    for (const subtask of subtasks) {
      const subCollab = subtask.metadata?.collab;
      if (subCollab?.assignee !== targetUserId) continue;
      await prisma.task.update({
        where: { id: subtask.id },
        data: { metadata: { ...(subtask.metadata || {}), collab: { ...subCollab, assignee: null } } }
      });
    }
  } catch (error) {
    console.warn("[collab] clear removed member assignee failed:", error?.message || error);
  }

  try {
    await prisma.notification.create({
      data: {
        userId: targetUserId,
        title: "你已被移出协同约定",
        body: `发起人将你移出了协同约定「${task.title}」，该约定不再出现在你的列表中`,
        channel: "in_app",
        status: "SENT",
        payload: { type: "collab_member_removed", taskId: task.id }
      }
    });
  } catch (error) {
    console.error("[collab] notify removed member failed:", error);
  }
  await notifyTaskParties(task, req.user, {
    type: "collab_member_removed",
    title: "协同约定成员变更",
    body: `${actorName(req.user)} 将 ${removedName} 移出了协同约定「${task.title}」`
  });
  await logCollabChange(req.user.id, task, "collab_member_removed", [
    { field: "member", field_label: "成员", old_value: removedName }
  ]);

  return res.json({ removed: true, user_id: targetUserId });
});

// ── 执行节点 ──
const nodeInputSchema = z.object({
  title: z.string().min(1).max(120),
  node_type: z.string().min(1).max(20).optional(),
  due_at: isoDateTime.optional().nullable(),
  sort_order: z.number().int().optional()
});

collabRouter.post("/:taskId/nodes", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = nodeInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const sortOrder = payload.data.sort_order ?? await prisma.collabNode.count({ where: { taskId: task.id } });
  const node = await prisma.collabNode.create({
    data: {
      taskId: task.id,
      title: payload.data.title.trim(),
      nodeType: payload.data.node_type || "stage",
      dueAt: payload.data.due_at ? new Date(payload.data.due_at) : null,
      sortOrder,
      createdBy: req.user.id
    }
  });
  await logCollabChange(req.user.id, task, "collab_node_created", [
    { field: "node", field_label: "执行节点", new_value: node.title }
  ]);
  return res.status(201).json(serializeNode(node));
});

const nodePatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  node_type: z.string().min(1).max(20).optional(),
  due_at: isoDateTime.optional().nullable(),
  done_at: isoDateTime.optional().nullable(),
  sort_order: z.number().int().optional()
});

collabRouter.patch("/:taskId/nodes/:nodeId", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = nodePatchSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const node = await prisma.collabNode.findFirst({ where: { id: req.params.nodeId, taskId: task.id } });
  if (!node) return res.status(404).json({ error: "NOT_FOUND", message: "节点不存在" });

  const data = {};
  const details = [];
  if (payload.data.title !== undefined) {
    data.title = payload.data.title.trim();
    details.push({ field: "title", field_label: "节点标题", old_value: node.title, new_value: data.title });
  }
  if (payload.data.node_type !== undefined) {
    data.nodeType = payload.data.node_type;
    details.push({ field: "node_type", field_label: "节点类型", old_value: node.nodeType, new_value: data.nodeType });
  }
  if (payload.data.due_at !== undefined) {
    data.dueAt = payload.data.due_at ? new Date(payload.data.due_at) : null;
    details.push({ field: "due_at", field_label: "截止时间", old_value: node.dueAt, new_value: data.dueAt });
  }
  if (payload.data.sort_order !== undefined) {
    data.sortOrder = payload.data.sort_order;
    details.push({ field: "sort_order", field_label: "排序", old_value: node.sortOrder, new_value: data.sortOrder });
  }

  let changeType = "collab_node_updated";
  if (payload.data.done_at !== undefined) {
    const doneAt = payload.data.done_at ? new Date(payload.data.done_at) : null;
    data.doneAt = doneAt;
    data.agentDone = false; // 人工操作覆盖「心栈确定」标记
    if (doneAt && !node.doneAt) {
      changeType = "collab_node_done";
      details.push({ field: "done_at", field_label: "完成时间", old_value: node.doneAt, new_value: doneAt });
    } else {
      details.push({ field: "done_at", field_label: "完成时间", old_value: node.doneAt, new_value: doneAt });
    }
  }

  const updated = await prisma.collabNode.update({ where: { id: node.id }, data });
  await logCollabChange(req.user.id, task, changeType, details);
  // 归口传导：子项完成/重开时，归口节点自动完成或回退（仅限自动完成的归口）
  if (payload.data.done_at !== undefined) {
    await cascadeNodeCompletion(updated, { byAgent: false });
  }
  return res.json(serializeNode(updated));
});

collabRouter.delete("/:taskId/nodes/:nodeId", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const node = await prisma.collabNode.findFirst({ where: { id: req.params.nodeId, taskId: task.id } });
  if (!node) return res.status(404).json({ error: "NOT_FOUND", message: "节点不存在" });
  await prisma.collabNode.delete({ where: { id: node.id } });
  await logCollabChange(req.user.id, task, "collab_node_deleted", [
    { field: "node", field_label: "执行节点", old_value: node.title }
  ]);
  return res.status(204).send();
});

// ── 沉淀文档 ──
collabRouter.get("/:taskId/docs", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const docs = await prisma.collabDoc.findMany({
    where: { taskId: result.task.id },
    orderBy: { updatedAt: "desc" }
  });
  return res.json(docs.map(serializeDoc));
});

const docInputSchema = z.object({
  title: z.string().min(1).max(120),
  doc_type: z.enum(["consensus", "dispute", "file", "minutes", "decision", "review"]).optional(),
  content: z.string().max(50000).default(""),
  source_comment_id: z.string().max(64).optional().nullable()
});

collabRouter.post("/:taskId/docs", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = docInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const doc = await prisma.collabDoc.create({
    data: {
      taskId: task.id,
      userId: req.user.id,
      title: payload.data.title.trim(),
      docType: payload.data.doc_type || "file",
      content: payload.data.content,
      version: 1,
      history: [],
      status: "draft",
      sourceCommentId: payload.data.source_comment_id || null
    }
  });
  await logCollabChange(req.user.id, task, "collab_doc_created", [
    { field: "doc", field_label: "沉淀文档", new_value: doc.title }
  ]);
  return res.status(201).json(serializeDoc(doc));
});

const docPatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  doc_type: z.enum(["consensus", "dispute", "file", "minutes", "decision", "review"]).optional(),
  content: z.string().max(50000).optional()
});

collabRouter.patch("/:taskId/docs/:docId", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = docPatchSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const doc = await prisma.collabDoc.findFirst({ where: { id: req.params.docId, taskId: task.id } });
  if (!doc) return res.status(404).json({ error: "NOT_FOUND", message: "文档不存在" });

  const data = {};
  const details = [];
  if (payload.data.title !== undefined) {
    data.title = payload.data.title.trim();
    details.push({ field: "title", field_label: "文档标题", old_value: doc.title, new_value: data.title });
  }
  if (payload.data.doc_type !== undefined) {
    data.docType = payload.data.doc_type;
    details.push({ field: "doc_type", field_label: "文档类型", old_value: doc.docType, new_value: data.docType });
  }
  if (payload.data.content !== undefined && payload.data.content !== doc.content) {
    const history = Array.isArray(doc.history) ? [...doc.history] : [];
    history.push({ content: doc.content, at: new Date().toISOString(), by: req.user.id, event: "update" });
    data.content = payload.data.content;
    data.version = doc.version + 1;
    data.history = history;
    data.status = "draft";
    data.agentConfirmed = false; // 内容变更后回到待确认，清除「心栈确定」标记
    details.push({ field: "content", field_label: "文档内容", old_value: "（上一版已存入历史）", new_value: `v${doc.version} → v${data.version}` });
  }

  const updated = Object.keys(data).length > 0
    ? await prisma.collabDoc.update({ where: { id: doc.id }, data })
    : doc;
  await logCollabChange(req.user.id, task, "collab_doc_updated", details);
  return res.json(serializeDoc(updated));
});

collabRouter.post("/:taskId/docs/:docId/confirm", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const doc = await prisma.collabDoc.findFirst({ where: { id: req.params.docId, taskId: task.id } });
  if (!doc) return res.status(404).json({ error: "NOT_FOUND", message: "文档不存在" });
  const history = Array.isArray(doc.history) ? [...doc.history] : [];
  history.push({ content: doc.content, at: new Date().toISOString(), by: req.user.id, event: "confirm" });
  const updated = await prisma.collabDoc.update({
    where: { id: doc.id },
    data: { status: "confirmed", version: doc.version + 1, agentConfirmed: false, history }
  });
  await logCollabChange(req.user.id, task, "collab_doc_confirmed", [
    { field: "status", field_label: "文档状态", old_value: doc.status, new_value: "confirmed" },
    { field: "version", field_label: "版本", old_value: doc.version, new_value: updated.version }
  ]);

  // 知识沉淀闭环：确认收下 → 自动写入心签页成为「沉淀签」，带来源徽标（协同 → 心签）。
  // 同一成员对同一文档只沉淀一条，重复确认更新内容与版本号；
  // 协同约定若归属于某颗搭子（metadata._extraFields.buddy_id），沉淀签一并标注搭子来源
  try {
    const existing = await prisma.note.findFirst({
      where: { userId: req.user.id, sourceType: "collab_sediment", title: doc.title, deletedAt: null }
    });
    const taskExtra = task.metadata && typeof task.metadata === "object" ? task.metadata._extraFields : null;
    const buddyId = taskExtra && typeof taskExtra === "object" ? taskExtra.buddy_id : null;
    const noteData = {
      title: doc.title,
      content: doc.content || doc.title,
      plainText: doc.content || doc.title,
      sourceType: "collab_sediment",
      tags: ["沉淀", "心签"],
      metadata: {
        _extraFields: {
          sediment_source: `协同空间 · ${task.title}`,
          collab_task_id: task.id,
          collab_doc_id: doc.id,
          doc_version: updated.version,
          ...(buddyId
            ? {
                buddy_id: buddyId,
                buddy_name: task.metadata?._extraFields?.buddy_name || BUDDY_NAMES[buddyId] || "搭子",
                source_buddy: buddyId,
                source_buddy_name: task.metadata?._extraFields?.buddy_name || BUDDY_NAMES[buddyId] || "搭子",
                source_scene: "协同沉淀",
                source_task_id: task.id,
                source_task_title: task.title
              }
            : {})
        }
      }
    };
    if (existing) {
      await prisma.note.update({ where: { id: existing.id }, data: noteData });
    } else {
      await prisma.note.create({ data: { userId: req.user.id, ...noteData } });
    }
  } catch (e) {
    console.warn("[collab] 沉淀签写入失败:", e?.message || e);
  }

  return res.json(serializeDoc(updated));
});

// POST /api/collab/:taskId/subtasks/:subId/confirm — 草案子约定按 confirmRule 推进确认
collabRouter.post("/:taskId/subtasks/:subId/confirm", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;

  // 从属子约定的 parentTaskId 是其他子约定的 id，需在整棵树中查找
  const subtask = (await collectSubtasks(task.id)).find((s) => s.id === req.params.subId);
  if (!subtask) return res.status(404).json({ error: "NOT_FOUND", message: "子约定不存在" });
  const subMeta = subtask.metadata?.collab;
  if (subMeta?.state !== "draft") {
    return res.status(409).json({ error: "NOT_DRAFT", message: "该子约定不是草案，无需确认" });
  }

  const confirmedBy = new Set(Array.isArray(subMeta.confirmedBy) ? subMeta.confirmedBy : []);
  confirmedBy.add(req.user.id);
  const rejectedBy = new Set(Array.isArray(subMeta.rejectedBy) ? subMeta.rejectedBy : []);
  rejectedBy.delete(req.user.id); // 勾选视为撤回勾掉
  const rule = task.metadata?.collab?.confirmRule === "owner" ? "owner" : "all";
  const memberIds = [...new Set([task.userId, ...task.members.map((m) => m.userId)])];
  const noReject = rejectedBy.size === 0;
  const active = noReject && (rule === "owner"
    ? confirmedBy.has(task.userId)
    : memberIds.every((id) => confirmedBy.has(id)));
  // 全员确认（无人勾掉）：直接勾掉该子约定，标注「N人已全部同意」，保留人工改回
  const allAgreed = noReject && memberIds.length > 0 && memberIds.every((id) => confirmedBy.has(id));

  const metadata = {
    ...(subtask.metadata || {}),
    collab: {
      ...subMeta,
      confirmedBy: [...confirmedBy],
      rejectedBy: [...rejectedBy],
      state: active ? "active" : "draft",
      ...(allAgreed
        ? { autoCompleted: true, autoCompletedAt: new Date().toISOString(), autoCompletedReason: `${memberIds.length}人已全部同意` }
        : {})
    }
  };
  const updated = await prisma.task.update({
    where: { id: subtask.id },
    data: {
      metadata,
      ...(allAgreed ? { status: "DONE", completedAt: new Date() } : {})
    }
  });
  if (allAgreed) await syncParentProgress(task.id);

  await logCollabChange(req.user.id, task, "collab_subtask_confirmed", [
    { field: "subtask", field_label: "子约定", new_value: subtask.title },
    { field: "state", field_label: "状态", old_value: "draft", new_value: active ? "active" : "draft（待其他成员确认）" },
    { field: "confirmed_by", field_label: "确认人", new_value: [...confirmedBy].join("、") }
  ]);

  if (allAgreed) {
    // 全员同意：记一条自动勾掉日志（成员本人都已确认，无需再通知）
    await logCollabChange(req.user.id, task, "collab_subtask_auto_done", [
      { field: "subtask", field_label: "子约定", new_value: subtask.title },
      { field: "auto", field_label: "完成方式", new_value: `${memberIds.length}人已全部同意，自动勾掉` }
    ]);
  } else if (active) {
    await notifyTaskParties(task, req.user, {
      type: "collab_subtask_confirmed",
      title: "子约定已确认生效",
      body: `子约定「${subtask.title}」已按确认规则（${rule === "owner" ? "发起人确认" : "全员确认"}）生效`
    });
  } else {
    // 大多数已确认、仅剩少数人时：Agent 自动标记并提醒待确认成员（有人勾掉则不提醒）
    await maybeRemindPendingConfirms(task, updated);
  }

  return res.json({
    subtask: serializeTask(updated),
    state: metadata.collab.state,
    confirm_rule: rule,
    confirmed_by: metadata.collab.confirmedBy,
    rejected_by: metadata.collab.rejectedBy,
    pending_confirm_users: memberIds.filter((id) => !confirmedBy.has(id))
  });
});

// POST /api/collab/:taskId/subtasks/:subId/reject — 勾掉草案：表达不同意，阻止其生效（可再勾选撤回）
collabRouter.post("/:taskId/subtasks/:subId/reject", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;

  const subtask = (await collectSubtasks(task.id)).find((s) => s.id === req.params.subId);
  if (!subtask) return res.status(404).json({ error: "NOT_FOUND", message: "子约定不存在" });
  const subMeta = subtask.metadata?.collab;
  if (subMeta?.state !== "draft") {
    return res.status(409).json({ error: "NOT_DRAFT", message: "该子约定不是草案，无需勾掉" });
  }

  const rejectedBy = new Set(Array.isArray(subMeta.rejectedBy) ? subMeta.rejectedBy : []);
  rejectedBy.add(req.user.id);
  const confirmedBy = new Set(Array.isArray(subMeta.confirmedBy) ? subMeta.confirmedBy : []);
  confirmedBy.delete(req.user.id);

  const metadata = {
    ...(subtask.metadata || {}),
    collab: { ...subMeta, confirmedBy: [...confirmedBy], rejectedBy: [...rejectedBy], state: "draft" }
  };
  const updated = await prisma.task.update({ where: { id: subtask.id }, data: { metadata } });

  await logCollabChange(req.user.id, task, "collab_subtask_rejected", [
    { field: "subtask", field_label: "子约定", new_value: subtask.title },
    { field: "rejected_by", field_label: "勾掉人", new_value: [...rejectedBy].join("、") }
  ]);

  return res.json({
    subtask: serializeTask(updated),
    state: "draft",
    confirmed_by: metadata.collab.confirmedBy,
    rejected_by: metadata.collab.rejectedBy
  });
});

// 「仅剩少数人未确认」提醒：聚合 + 节流。
// 旧实现：每确认一个草案就单独发一条提醒——用户连续确认多个草案时，同一时间刷出一批
// 措辞几乎相同的提醒消息。现在改为：扫描全任务所有处于「少数待确认」状态的草案，
// 合并成一条聚合提醒，并按任务级 10 分钟节流，避免刷屏。
const PENDING_REMIND_THROTTLE_MS = Number(process.env.COLLAB_PENDING_REMIND_THROTTLE_MS || 10 * 60 * 1000);

async function maybeRemindPendingConfirms(task, subtask) {
  try {
    const meta = subtask.metadata?.collab || {};
    if (meta.state !== "draft") return;
    const rejectedBy = Array.isArray(meta.rejectedBy) ? meta.rejectedBy : [];
    if (rejectedBy.length > 0) return; // 已被勾掉：尊重否决，不再提醒

    const memberIds = [...new Set([task.userId, ...task.members.map((m) => m.userId)])];
    // 全任务聚合：所有「草案 + 已有人确认 + 无人勾掉 + 仅剩少数未确认」的子约定
    const pendingItems = [];
    for (const s of await collectSubtasks(task.id)) {
      const m = s.metadata?.collab || {};
      if (m.state !== "draft") continue;
      const rej = Array.isArray(m.rejectedBy) ? m.rejectedBy : [];
      if (rej.length > 0) continue;
      const conf = new Set(Array.isArray(m.confirmedBy) ? m.confirmedBy : []);
      const pending = memberIds.filter((id) => !conf.has(id));
      if (pending.length === 0) continue;
      // 大多数已认可：待确认的是少数（≤2 人）且其余都已确认
      const minority = pending.length <= 2 && conf.size >= memberIds.length - 2 && conf.size >= 1;
      if (!minority) continue;
      pendingItems.push({ subtask: s, confirmed: conf.size, pending });
    }
    if (pendingItems.length === 0) return;

    // 任务级节流：刚提醒过（10 分钟内）则跳过——同一批待确认人不需要反复提醒
    const fresh = await prisma.task.findUnique({ where: { id: task.id } });
    const freshCollab = fresh?.metadata?.collab;
    const prev = freshCollab?.reminder;
    if (prev?.at && Date.now() - Date.parse(prev.at) < PENDING_REMIND_THROTTLE_MS) return;

    const pendingUserIds = [...new Set(pendingItems.flatMap((p) => p.pending))];
    const pendingUsers = await prisma.user.findMany({ where: { id: { in: pendingUserIds } } });
    const nameOf = (id) => {
      const u = pendingUsers.find((x) => x.id === id);
      return u?.displayName || u?.email || u?.phone || "成员";
    };

    const lines = pendingItems.map((p) => {
      const names = p.pending.map(nameOf).join("、");
      return `· 「${p.subtask.title}」已获 ${p.confirmed}/${memberIds.length} 位成员确认，还差 ${names} 勾选生效`;
    });
    const content = `以下草案子约定已获大多数成员确认，勾选即生效：\n${lines.join("\n")}\n如有不同意见，直接勾掉即可。`;
    await postAgentMessage(task.id, { content, topic: "提醒" });

    const titles = pendingItems.map((p) => `「${p.subtask.title}」`).join("、");
    for (const id of pendingUserIds) {
      await prisma.notification.create({
        data: {
          userId: id,
          title: "协同约定：待你确认",
          body: `「${task.title}」的 ${titles} 已获大多数成员确认，还差你勾选生效（不同意可勾掉）。`,
          channel: "in_app",
          status: "SENT",
          payload: { type: "collab_pending_confirm", taskId: task.id, link: `/collabspace?taskId=${task.id}` }
        }
      });
    }

    const aggKey = pendingItems
      .map((p) => `${p.subtask.id}:${p.pending.slice().sort().join("|")}`)
      .sort()
      .join(",");
    await prisma.task.update({
      where: { id: task.id },
      data: {
        metadata: {
          ...(fresh?.metadata || {}),
          collab: { ...(freshCollab || {}), reminder: { at: new Date().toISOString(), key: aggKey } }
        }
      }
    });
    await logCollabChange(task.userId, task, "collab_pending_reminder", [
      { field: "subtasks", field_label: "子约定", new_value: pendingItems.map((p) => p.subtask.title).join("、") },
      { field: "pending", field_label: "待确认成员", new_value: pendingUserIds.map(nameOf).join("、") }
    ]);
  } catch (error) {
    console.error("[collab] maybeRemindPendingConfirms failed:", error?.message || error);
  }
}

// PATCH /api/collab/:taskId/subtasks/:subId/reparent — 拖动挂载：把子约定挂到其他子约定下（parent_id 为空则回到顶层）
const reparentSchema = z.object({
  parent_id: z.string().max(64).nullable().optional()
});

collabRouter.patch("/:taskId/subtasks/:subId/reparent", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = reparentSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const subtasks = await collectSubtasks(task.id);
  const subtask = subtasks.find((s) => s.id === req.params.subId);
  if (!subtask) return res.status(404).json({ error: "NOT_FOUND", message: "子约定不存在" });

  const requested = payload.data.parent_id || null;
  let targetParentId = task.id; // 顶层
  if (requested) {
    if (requested === subtask.id) {
      return res.status(400).json({ error: "INVALID_PARENT", message: "不能挂载到自身" });
    }
    const parent = subtasks.find((s) => s.id === requested);
    if (!parent) return res.status(404).json({ error: "NOT_FOUND", message: "目标父约定不存在" });
    // 防循环：从目标父约定沿父链向上，命中自己则说明目标在自己的从属树下
    const chain = [];
    let cursor = parent;
    while (cursor) {
      if (cursor.id === subtask.id) {
        return res.status(400).json({ error: "CYCLE", message: "不能挂载到自己的从属约定下" });
      }
      chain.push(cursor.id);
      if (!cursor.parentTaskId || cursor.parentTaskId === task.id) break;
      cursor = subtasks.find((s) => s.id === cursor.parentTaskId);
      if (!cursor) break;
    }
    if (chain.length >= 3) {
      return res.status(400).json({ error: "TOO_DEEP", message: "从属层级最多3级，请先调整上层结构" });
    }
    targetParentId = parent.id;
  }

  const currentParentId = subtask.parentTaskId || task.id;
  if (currentParentId === targetParentId) {
    return res.json({ subtask: serializeTask(subtask), moved: false });
  }

  const updated = await prisma.task.update({
    where: { id: subtask.id },
    data: { parentTaskId: targetParentId }
  });
  await syncParentProgress(task.id);
  await logCollabChange(req.user.id, task, "collab_subtask_moved", [
    { field: "subtask", field_label: "子约定", new_value: subtask.title },
    {
      field: "parent", field_label: "挂载到",
      old_value: currentParentId === task.id ? "顶层" : (subtasks.find((s) => s.id === currentParentId)?.title || currentParentId),
      new_value: targetParentId === task.id ? "顶层" : (subtasks.find((s) => s.id === targetParentId)?.title || targetParentId)
    }
  ]);
  return res.json({ subtask: serializeTask(updated), moved: true });
});

// POST /api/collab/:taskId/messages — 发讨论；内容含 @Agent|@心栈 时后台触发沟通 Agent
const messageSchema = z.object({
  content: z.string().min(1).max(5000),
  parent_id: z.string().max(64).optional().nullable(),
  parentId: z.string().max(64).optional().nullable(),
  topic: z.string().max(50).optional().nullable(),
  mark: z.enum(["consensus", "dispute", "pending"]).optional().nullable(),
  mentions: z.array(z.string().max(64)).max(20).optional().nullable(),
  attachments: z.array(z.object({
    url: z.string().max(500),
    name: z.string().max(200).optional().nullable(),
    type: z.string().max(100).optional().nullable(),
    size: z.number().optional().nullable()
  })).max(10).optional().nullable()
});

collabRouter.post("/:taskId/messages", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = messageSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  if (await rejectIfRisky(res, payload.data.content, req.user.id)) return;

  const parentId = payload.data.parent_id || payload.data.parentId || null;
  if (parentId) {
    const parent = await prisma.comment.findFirst({ where: { id: parentId, taskId: task.id } });
    if (!parent) {
      return res.status(400).json({ error: "INVALID_PARENT", message: "要回复的讨论不存在" });
    }
    if (parent.parentId) {
      return res.status(400).json({ error: "INVALID_PARENT", message: "不支持回复的回复" });
    }
  }

  const comment = await prisma.comment.create({
    data: {
      userId: req.user.id,
      taskId: task.id,
      content: payload.data.content,
      mentions: payload.data.mentions || [],
      parentId,
      topic: payload.data.topic || null,
      mark: payload.data.mark || null,
      attachments: payload.data.attachments || []
    },
    include: { user: true }
  });

  await notifyTaskParties(task, req.user, {
    type: "collab_message",
    title: "协同约定有新讨论",
    body: `${actorName(req.user)} 在「${task.title}」说：${payload.data.content.slice(0, 80)}`
  });
  await notifyMentions(task, req.user, {
    commentId: comment.id,
    content: payload.data.content,
    mentionedUserIds: payload.data.mentions || [],
  });

  res.status(201).json(serializeComment(comment));

  const mentionAgent = /@\s*(agent|心栈)/i.test(payload.data.content);
  if (mentionAgent) {
    setImmediate(() => {
      runCollabAgent({ taskId: task.id, action: "coordinate", user: req.user, commentId: comment.id })
        .catch((error) => {
          if (error?.code === "AGENT_BUSY") return; // 上一轮 Agent 仍在执行，本条消息由该轮覆盖
          console.error("[collab] @Agent 沟通失败:", error?.message || error);
        });
    });
  }

  // 执行驱动：成员每条发言都调度一轮自动驱动（内部防抖 + 最短间隔守卫，失败静默）
  scheduleCollabDrive(task.id);
});

// POST /api/collab/:taskId/messages/:commentId/options/:optionId/choice — 成员对 Agent 选项卡表达倾向
const optionChoiceSchema = z.object({ action: z.enum(["adopt", "discard", "reset"]) });

collabRouter.post("/:taskId/messages/:commentId/options/:optionId/choice", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = optionChoiceSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const comment = await prisma.comment.findFirst({ where: { id: req.params.commentId, taskId: task.id } });
  if (!comment || !comment.agent) {
    return res.status(404).json({ error: "NOT_FOUND", message: "选项卡片不存在" });
  }
  const attachments = Array.isArray(comment.attachments) ? [...comment.attachments] : [];
  const idx = attachments.findIndex(
    (a) => a?.type === "option_card" && (Array.isArray(a.options) ? a.options : []).some((o) => o?.id === req.params.optionId)
  );
  if (idx < 0) return res.status(404).json({ error: "NOT_FOUND", message: "选项不存在" });

  const card = { ...attachments[idx] };
  const opt = (Array.isArray(card.options) ? card.options : []).find((o) => o?.id === req.params.optionId);
  const choices = { ...(card.choices || {}) };
  const prev = choices[req.user.id] || {};
  if (payload.data.action === "reset") {
    delete choices[req.user.id];
  } else if (payload.data.action === "adopt") {
    // 一张卡片一个采纳：改采纳其他候选会自动替换
    choices[req.user.id] = {
      adopt: req.params.optionId,
      discard: Array.isArray(prev.discard) ? prev.discard : [],
      at: new Date().toISOString()
    };
  } else {
    const discard = new Set(Array.isArray(prev.discard) ? prev.discard : []);
    if (discard.has(req.params.optionId)) discard.delete(req.params.optionId);
    else discard.add(req.params.optionId);
    if (discard.size === 0 && !prev.adopt) delete choices[req.user.id];
    else choices[req.user.id] = { adopt: prev.adopt || null, discard: [...discard], at: new Date().toISOString() };
  }
  card.choices = choices;
  attachments[idx] = card;
  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { attachments }
  });

  await logCollabChange(req.user.id, task, "collab_option_choice", [
    { field: "option", field_label: "候选", new_value: opt?.title || req.params.optionId },
    { field: "choice", field_label: "选择", new_value: { adopt: "采纳", discard: "放弃", reset: "撤销" }[payload.data.action] }
  ]);
  return res.json(serializeComment(updated));
});

// POST /api/collab/:taskId/convert — 讨论转对象：subtask（草案子约定）| node（执行节点）| doc（沉淀文件）
const convertSchema = z.object({
  comment_id: z.string().min(1).optional(),
  commentId: z.string().min(1).optional(),
  target: z.enum(["subtask", "node", "doc"])
}).refine((data) => data.comment_id || data.commentId, { message: "commentId 必填" });

collabRouter.post("/:taskId/convert", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = convertSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const commentId = payload.data.comment_id || payload.data.commentId;
  const comment = await prisma.comment.findFirst({ where: { id: commentId, taskId: task.id } });
  if (!comment) return res.status(404).json({ error: "NOT_FOUND", message: "讨论不存在" });

  const target = payload.data.target;
  if (target === "subtask") {
    const subtask = await prisma.task.create({
      data: {
        userId: req.user.id,
        title: comment.content.trim().slice(0, 50),
        description: comment.content,
        status: "TODO",
        priority: "medium",
        parentTaskId: task.id,
        metadata: {
          collab: {
            state: "draft",
            standard: "",
            assignee: null,
            confirmedBy: [],
            sourceCommentId: comment.id
          }
        }
      }
    });
    await syncParentProgress(task.id);
    await logCollabChange(req.user.id, task, "collab_subtask_draft", [
      { field: "subtask", field_label: "子约定", new_value: subtask.title },
      { field: "source", field_label: "来源讨论", new_value: comment.id }
    ]);
    return res.status(201).json({ target, comment_id: comment.id, subtask: serializeTask(subtask) });
  }

  if (target === "node") {
    const sortOrder = await prisma.collabNode.count({ where: { taskId: task.id } });
    const node = await prisma.collabNode.create({
      data: {
        taskId: task.id,
        title: comment.content.trim().slice(0, 50),
        nodeType: "stage",
        sortOrder,
        createdBy: req.user.id
      }
    });
    await logCollabChange(req.user.id, task, "collab_node_created", [
      { field: "node", field_label: "执行节点", new_value: node.title },
      { field: "source", field_label: "来源讨论", new_value: comment.id }
    ]);
    return res.status(201).json({ target, comment_id: comment.id, node: serializeNode(node) });
  }

  const attachmentLines = (Array.isArray(comment.attachments) ? comment.attachments : [])
    .map((a) => `- [${a?.name || "附件"}](${a?.url})`).join("\n");
  const doc = await prisma.collabDoc.create({
    data: {
      taskId: task.id,
      userId: req.user.id,
      title: comment.content.trim().slice(0, 50),
      docType: "file",
      content: comment.content + (attachmentLines ? `\n\n附件：\n${attachmentLines}` : ""),
      version: 1,
      history: [],
      status: "draft",
      sourceCommentId: comment.id
    }
  });
  await logCollabChange(req.user.id, task, "collab_doc_created", [
    { field: "doc", field_label: "沉淀文档", new_value: doc.title },
    { field: "source", field_label: "来源讨论", new_value: comment.id }
  ]);
  return res.status(201).json({ target, comment_id: comment.id, doc: serializeDoc(doc) });
});

// GET /api/collab/:taskId/activity — 空间动态（collab_* 与常规变更），时间倒序 50 条
// POST /api/collab/:taskId/convert-type — 共创约定转回普通约定/打卡约定（仅创建者；空间数据保留在库，可再开启恢复）
// 注意：路径不能用 /convert（已被「讨论转对象」占用）
const convertFromCollabSchema = z.object({ target: z.enum(["task", "checkin"]) });

collabRouter.post("/:taskId/convert-type", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  if (task.userId !== req.user.id) {
    return res.status(403).json({ error: "FORBIDDEN", message: "只有发起人可以把共创约定转回普通/打卡约定" });
  }
  const payload = convertFromCollabSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const fresh = await prisma.task.findUnique({ where: { id: task.id } });
  const meta = { ...(fresh?.metadata || {}) };
  const archivedCollab = meta.collab;
  delete meta.collab;
  meta._archivedCollab = archivedCollab; // 协同配置归档；执行节点/沉淀/讨论不动，再开启协同时空间直接恢复
  if (payload.data.target === "checkin") {
    // 打卡约定需要每日重复语义（今日已赴约 / 滚存下一期）
    const prevExtra = meta._extraFields && typeof meta._extraFields === "object" && !Array.isArray(meta._extraFields)
      ? meta._extraFields
      : {};
    if (!prevExtra.repeat_rule || prevExtra.repeat_rule === "none") {
      meta._extraFields = { ...prevExtra, repeat_rule: "daily" };
    }
  }
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      metadata: meta,
      category: payload.data.target === "checkin"
        ? "checkin"
        : (fresh.category === "collab" ? "personal" : fresh.category)
    }
  });
  await logCollabChange(req.user.id, task, "collab_converted", [
    { field: "target", field_label: "转换为", new_value: payload.data.target === "checkin" ? "打卡约定" : "普通约定" }
  ]);
  return res.json(serializeTask(updated));
});

collabRouter.get("/:taskId/activity", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const logs = await prisma.taskChangeLog.findMany({
    where: { OR: [{ taskId: result.task.id }, { parentTaskId: result.task.id }] },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: true }
  });
  return res.json(logs.map(serializeActivity));
});

// POST /api/collab/:taskId/agent — {action: tidy|minutes|disputes|extract_subtasks|coordinate, commentId?}
const agentSchema = z.object({
  action: z.enum(["tidy", "minutes", "disputes", "extract_subtasks", "coordinate"]),
  comment_id: z.string().max(64).optional().nullable(),
  commentId: z.string().max(64).optional().nullable()
});

collabRouter.post("/:taskId/agent", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;
  const payload = agentSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const commentId = payload.data.comment_id || payload.data.commentId || null;

  try {
    const outcome = await runCollabAgent({
      taskId: task.id,
      action: payload.data.action,
      user: req.user,
      commentId
    });
    const r = outcome.result || {};
    return res.json({
      ok: true,
      action: outcome.action,
      degraded: outcome.degraded,
      result: {
        ...(r.consensus_doc ? { consensus_doc: serializeDoc(r.consensus_doc) } : {}),
        ...(r.dispute_doc ? { dispute_doc: serializeDoc(r.dispute_doc) } : {}),
        ...(r.doc ? { doc: serializeDoc(r.doc) } : {}),
        ...(r.summary ? { summary: r.summary } : {}),
        ...(r.message_comment_id ? { message_comment_id: r.message_comment_id } : {}),
        ...(r.reply_comment_id ? { reply_comment_id: r.reply_comment_id } : {}),
        ...(r.created ? { created: r.created.map(serializeTask) } : {}),
        ...(r.nodes ? { nodes: r.nodes.map(serializeNode) } : {}),
        ...(r.notified ? { notified: r.notified } : {}),
        ...(r.questions_count !== undefined ? { questions_count: r.questions_count } : {})
      }
    });
  } catch (error) {
    if (error?.code === "INSUFFICIENT_CREDITS") {
      return res.status(402).json({
        error: "INSUFFICIENT_CREDITS", message: error.message,
        balance: error.balance, required: error.required
      });
    }
    if (error?.status === 403) {
      return res.status(403).json({ error: error.code || "FORBIDDEN", message: error.message });
    }
    if (error?.status === 404) {
      return res.status(404).json({ error: error.code || "NOT_FOUND", message: error.message });
    }
    if (error?.status === 400) {
      return res.status(400).json({ error: error.code || "INVALID_INPUT", message: error.message });
    }
    console.error(`[collab] agent ${payload.data.action} 失败:`, error?.message || error);
    return res.status(502).json({ error: "AGENT_FAILED", message: error?.message || "Agent 执行失败，请稍后重试" });
  }
});
