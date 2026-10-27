import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { rejectIfRisky } from "../services/contentSecurity.js";
import { assertTaskAccess, notifyTaskParties } from "../services/taskSharing.js";

export const commentsRouter = Router();

const commentSchema = z.object({
  task_id: z.string().min(1),
  content: z.string().min(1).max(5000),
  mentions: z.array(z.string()).optional(),
  // 协同约定讨论：线程回复 / 主题 / 共识·分歧·待确认标记 / 附件
  parent_id: z.string().optional().nullable(),
  topic: z.string().max(50).optional().nullable(),
  mark: z.enum(["consensus", "dispute", "pending"]).optional().nullable(),
  attachments: z.array(z.object({
    url: z.string().max(500),
    name: z.string().max(200).optional().nullable(),
    type: z.string().max(100).optional().nullable(),
    size: z.number().optional().nullable()
  })).max(10).optional().nullable()
});

commentsRouter.use(requireAuth);

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt"
  };
  return { [mapping[key] || "createdAt"]: order };
}

export function serializeComment(comment) {
  const visitorLabel = comment.visitorName || (comment.visitorToken ? `访客 #${comment.visitorToken.slice(0, 6)}` : null);
  return {
    id: comment.id,
    task_id: comment.taskId,
    content: comment.content,
    mentions: comment.mentions || [],
    parent_id: comment.parentId,
    topic: comment.topic,
    mark: comment.mark,
    agent: comment.agent,
    attachments: comment.attachments || [],
    created_by: comment.user?.email || "",
    created_by_name: comment.user?.displayName || comment.user?.email || comment.visitorName || (comment.agent ? "心栈 Agent" : ""),
    created_by_id: comment.userId,
    visitor_token: comment.visitorToken,
    visitor_name: comment.visitorName,
    visitor_label: visitorLabel,
    created_date: comment.createdAt,
    updated_date: comment.updatedAt
  };
}

// 约定讨论：根消息按序挂载 replies（只支持一层回复，与 publicShare 校验一致）
export function buildCommentTree(comments) {
  const nodes = new Map();
  for (const comment of comments) nodes.set(comment.id, { ...serializeComment(comment), replies: [] });
  const roots = [];
  for (const node of nodes.values()) {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id).replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const byCreated = (a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime();
  roots.sort(byCreated);
  for (const node of nodes.values()) node.replies.sort(byCreated);
  return roots;
}

commentsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const where = {};
  const isTaskThread = Boolean(req.query.task_id);
  if (req.query.task_id) {
    // 共有约定：创建者/成员可读，无权限按不存在处理
    const result = await assertTaskAccess(req, res, String(req.query.task_id));
    if (!result) return;
    where.taskId = String(req.query.task_id);
  }
  const comments = await prisma.comment.findMany({
    where,
    orderBy: parseSort(req.query.sort),
    take: Number.isFinite(limit) ? limit : 100,
    include: { user: true }
  });
  // 约定讨论返回线程树（replies 嵌套）；笔记等场景保持扁平列表
  if (isTaskThread) return res.json(buildCommentTree(comments));
  return res.json(comments.map(serializeComment));
});

commentsRouter.post("/", async (req, res) => {
  const payload = commentSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  // 内容安全：评论内容需通过 msgSecCheck
  if (await rejectIfRisky(res, payload.data.content, req.user.id)) return;

  // 共有约定：创建者/成员可评论
  const result = await assertTaskAccess(req, res, payload.data.task_id);
  if (!result) return;

  // 回复校验：父评论必须属于同一约定，且只支持一层回复
  const parentId = payload.data.parent_id || null;
  if (parentId) {
    const parent = await prisma.comment.findFirst({ where: { id: parentId, taskId: payload.data.task_id } });
    if (!parent) {
      return res.status(400).json({ error: "INVALID_PARENT", message: "要回复的评论不存在" });
    }
    if (parent.parentId) {
      return res.status(400).json({ error: "INVALID_PARENT", message: "不支持回复的回复" });
    }
  }

  const comment = await prisma.comment.create({
    data: {
      userId: req.user.id,
      taskId: payload.data.task_id,
      content: payload.data.content,
      mentions: payload.data.mentions || [],
      parentId,
      topic: payload.data.topic || null,
      mark: payload.data.mark || null,
      attachments: payload.data.attachments || []
    },
    include: { user: true }
  });

  await notifyTaskParties(result.task, req.user, {
    type: "shared_task_comment",
    title: "共有约定有新评论",
    body: `${req.user.displayName || req.user.email || "对方"} 评论了「${result.task.title}」：${payload.data.content.slice(0, 60)}`
  });

  return res.status(201).json(serializeComment(comment));
});

// 协同讨论：更新消息的共识/分歧/待确认标记（评论作者或约定 owner）
const commentPatchSchema = z.object({
  mark: z.enum(["consensus", "dispute", "pending"]).nullable()
});

commentsRouter.patch("/:id", async (req, res) => {
  const payload = commentPatchSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const existing = await prisma.comment.findFirst({
    where: { id: req.params.id },
    include: { task: true }
  });
  if (!existing || existing.taskId == null) {
    return res.status(404).json({ error: "NOT_FOUND", message: "评论不存在" });
  }
  const isAuthor = existing.userId === req.user.id;
  const isOwner = existing.task && existing.task.userId === req.user.id;
  if (!isAuthor && !isOwner) {
    return res.status(403).json({ error: "FORBIDDEN", message: "只有评论作者或约定创建者可以标记" });
  }
  const comment = await prisma.comment.update({
    where: { id: existing.id },
    data: { mark: payload.data.mark },
    include: { user: true }
  });
  return res.json(serializeComment(comment));
});

commentsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.comment.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "评论不存在" });
  }

  await prisma.comment.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
