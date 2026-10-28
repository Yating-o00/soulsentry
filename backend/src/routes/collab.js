// 协同约定空间路由：成员 / 执行节点 / 沉淀文档 / 子约定确认 / 讨论 / 转换 / 动态 / Agent
// 统一前置：requireAuth + assertTaskAccess + 任务已开启协同（metadata.collab）
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { rejectIfRisky } from "../services/contentSecurity.js";
import { assertTaskAccess, notifyTaskParties } from "../services/taskSharing.js";
import { serializeTask, syncParentProgress } from "./tasks.js";
import { serializeComment } from "./comments.js";
import { runCollabAgent } from "../services/collabAgent.js";
import { collectSubtasks, logCollabChange, nestSubtasks } from "../services/collabSpace.js";

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

  if (req.user.id !== task.userId) {
    return res.status(403).json({ error: "FORBIDDEN", message: "只有约定创建者可以添加成员" });
  }
  const schema = z.object({
    phone: z.string().min(3).max(30).optional(),
    email: z.string().email().max(100).optional()
  }).refine((data) => data.phone || data.email, { message: "phone 或 email 至少提供一个" });
  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const email = payload.data.email ? payload.data.email.trim().toLowerCase() : undefined;
  const phone = payload.data.phone ? payload.data.phone.trim() : undefined;
  const user = await prisma.user.findFirst({ where: { OR: [{ phone }, { email }] } });
  if (!user) {
    return res.status(404).json({
      error: "USER_NOT_FOUND",
      hint: "该手机号/邮箱还未注册心栈，请通过邀请链接邀请对方加入"
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

// ── 执行节点 ──
const nodeInputSchema = z.object({
  title: z.string().min(1).max(120),
  node_type: z.enum(["time", "stage", "decision", "review"]).optional(),
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
  node_type: z.enum(["time", "stage", "decision", "review"]).optional(),
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
    if (doneAt && !node.doneAt) {
      changeType = "collab_node_done";
      details.push({ field: "done_at", field_label: "完成时间", old_value: node.doneAt, new_value: doneAt });
    } else {
      details.push({ field: "done_at", field_label: "完成时间", old_value: node.doneAt, new_value: doneAt });
    }
  }

  const updated = await prisma.collabNode.update({ where: { id: node.id }, data });
  await logCollabChange(req.user.id, task, changeType, details);
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
    data: { status: "confirmed", version: doc.version + 1, history }
  });
  await logCollabChange(req.user.id, task, "collab_doc_confirmed", [
    { field: "status", field_label: "文档状态", old_value: doc.status, new_value: "confirmed" },
    { field: "version", field_label: "版本", old_value: doc.version, new_value: updated.version }
  ]);
  return res.json(serializeDoc(updated));
});

// POST /api/collab/:taskId/subtasks/:subId/confirm — 草案子约定按 confirmRule 推进确认
collabRouter.post("/:taskId/subtasks/:subId/confirm", async (req, res) => {
  const result = await loadCollabSpace(req, res);
  if (!result) return;
  const { task } = result;

  const subtask = await prisma.task.findFirst({
    where: { id: req.params.subId, parentTaskId: task.id, deletedAt: null }
  });
  if (!subtask) return res.status(404).json({ error: "NOT_FOUND", message: "子约定不存在" });
  const subMeta = subtask.metadata?.collab;
  if (subMeta?.state !== "draft") {
    return res.status(409).json({ error: "NOT_DRAFT", message: "该子约定不是草案，无需确认" });
  }

  const confirmedBy = new Set(Array.isArray(subMeta.confirmedBy) ? subMeta.confirmedBy : []);
  confirmedBy.add(req.user.id);
  const rule = task.metadata?.collab?.confirmRule === "owner" ? "owner" : "all";
  const memberIds = [...new Set([task.userId, ...task.members.map((m) => m.userId)])];
  const active = rule === "owner"
    ? confirmedBy.has(task.userId)
    : memberIds.every((id) => confirmedBy.has(id));

  const metadata = {
    ...(subtask.metadata || {}),
    collab: {
      ...subMeta,
      confirmedBy: [...confirmedBy],
      state: active ? "active" : "draft"
    }
  };
  const updated = await prisma.task.update({ where: { id: subtask.id }, data: { metadata } });

  await logCollabChange(req.user.id, task, "collab_subtask_confirmed", [
    { field: "subtask", field_label: "子约定", new_value: subtask.title },
    { field: "state", field_label: "状态", old_value: "draft", new_value: active ? "active" : "draft（待其他成员确认）" },
    { field: "confirmed_by", field_label: "确认人", new_value: [...confirmedBy].join("、") }
  ]);

  if (active) {
    await notifyTaskParties(task, req.user, {
      type: "collab_subtask_confirmed",
      title: "子约定已确认生效",
      body: `子约定「${subtask.title}」已按确认规则（${rule === "owner" ? "发起人确认" : "全员确认"}）生效`
    });
  }

  return res.json({
    subtask: serializeTask(updated),
    state: metadata.collab.state,
    confirm_rule: rule,
    confirmed_by: metadata.collab.confirmedBy,
    pending_confirm_users: memberIds.filter((id) => !confirmedBy.has(id))
  });
});

// POST /api/collab/:taskId/messages — 发讨论；内容含 @Agent|@心栈 时后台触发沟通 Agent
const messageSchema = z.object({
  content: z.string().min(1).max(5000),
  parent_id: z.string().max(64).optional().nullable(),
  parentId: z.string().max(64).optional().nullable(),
  topic: z.string().max(50).optional().nullable(),
  mark: z.enum(["consensus", "dispute", "pending"]).optional().nullable(),
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
      mentions: [],
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

  res.status(201).json(serializeComment(comment));

  const mentionAgent = /@\s*(agent|心栈)/i.test(payload.data.content);
  if (mentionAgent) {
    setImmediate(() => {
      runCollabAgent({ taskId: task.id, action: "coordinate", user: req.user, commentId: comment.id })
        .catch((error) => console.error("[collab] @Agent 沟通失败:", error?.message || error));
    });
  }
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
