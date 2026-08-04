import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const publicShareRouter = Router();

function serializeTask(task) {
  const metadata = task.metadata || {};
  const extraFields = typeof metadata._extraFields === "object" && metadata._extraFields !== null
    ? metadata._extraFields
    : {};

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status === "DONE"
      ? "completed"
      : task.status === "TODO"
        ? "pending"
        : task.status.toLowerCase(),
    priority: task.priority,
    category: task.category,
    due_at: task.dueAt,
    reminder_time: task.reminderTime,
    end_time: task.endTime,
    is_all_day: task.isAllDay,
    parent_task_id: task.parentTaskId,
    gcal_sync_enabled: task.gcalSyncEnabled,
    progress: task.progress,
    completed_at: task.completedAt,
    deleted_at: task.deletedAt,
    tags: task.tags,
    reminder_strategy: task.reminderStrategy,
    ...extraFields,
    metadata: task.metadata,
    created_date: task.createdAt,
    updated_date: task.updatedAt
  };
}

function serializeNote(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    plain_text: note.plainText,
    status: note.status.toLowerCase(),
    color: note.color,
    source_type: note.sourceType,
    ai_status: note.aiStatus,
    deleted_at: note.deletedAt,
    tags: note.tags,
    created_date: note.createdAt,
    updated_date: note.updatedAt
  };
}

function serializeComment(comment) {
  return {
    id: comment.id,
    task_id: comment.taskId,
    note_id: comment.noteId,
    content: comment.content,
    mentions: comment.mentions || [],
    created_by: comment.user?.email || comment.visitorName || "访客",
    created_by_id: comment.user?.id || null,
    visitor_token: comment.visitorToken,
    visitor_name: comment.visitorName,
    created_date: comment.createdAt,
    updated_date: comment.updatedAt
  };
}

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

function isShareExpired(item) {
  if (!item.shareEnabled) return true;
  if (item.shareExpiresAt && new Date(item.shareExpiresAt) < new Date()) return true;
  return false;
}

async function findSharedItem(token) {
  const task = await prisma.task.findUnique({
    where: { shareToken: token },
    include: { user: true }
  });
  if (task) return { type: "task", item: task };

  const note = await prisma.note.findUnique({
    where: { shareToken: token },
    include: { user: true }
  });
  if (note) return { type: "note", item: note };

  return null;
}

function ensureVisitorToken(req) {
  const token = req.body.visitor_token || req.headers["x-visitor-token"];
  if (token && typeof token === "string" && token.length >= 8) return token;
  return crypto.randomBytes(16).toString("hex");
}

async function notifyOwner(ownerId, payload) {
  try {
    await prisma.notification.create({
      data: {
        userId: ownerId,
        title: payload.title,
        body: payload.body,
        channel: "in_app",
        status: "SENT",
        payload: {
          type: payload.type || "public_share_action",
          ...payload
        }
      }
    });
  } catch (error) {
    console.error("[publicShare] failed to notify owner:", error);
  }
}

// POST /api/public/share/generate/:type/:id - 生成/刷新分享 token（需登录）
// 使用 /generate 前缀避免与 /:token/comments 等匿名路由冲突
publicShareRouter.post("/generate/:type/:id", requireAuth, async (req, res) => {
  const type = req.params.type;
  const id = req.params.id;
  if (!["task", "note"].includes(type)) {
    return res.status(400).json({ error: "INVALID_TYPE", message: "类型必须是 task 或 note" });
  }

  const schema = z.object({
    enabled: z.boolean().optional().default(true),
    expires_in_hours: z.number().int().min(1).max(720).optional().nullable()
  }).passthrough();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const { enabled, expires_in_hours } = parsed.data;
  const expiresAt = expires_in_hours ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000) : null;

  try {
    if (type === "task") {
      const task = await prisma.task.findFirst({ where: { id, userId: req.user.id } });
      if (!task) return res.status(404).json({ error: "NOT_FOUND" });

      const token = task.shareToken || generateToken();
      const updated = await prisma.task.update({
        where: { id },
        data: { shareToken: token, shareEnabled: enabled, shareExpiresAt: expiresAt }
      });

      return res.json({
        type: "task",
        id: updated.id,
        token,
        enabled: updated.shareEnabled,
        expires_at: updated.shareExpiresAt,
        url: `${req.protocol}://${req.get("host")}/share/${token}`
      });
    }

    const note = await prisma.note.findFirst({ where: { id, userId: req.user.id } });
    if (!note) return res.status(404).json({ error: "NOT_FOUND" });

    const token = note.shareToken || generateToken();
    const updated = await prisma.note.update({
      where: { id },
      data: { shareToken: token, shareEnabled: enabled, shareExpiresAt: expiresAt }
    });

    return res.json({
      type: "note",
      id: updated.id,
      token,
      enabled: updated.shareEnabled,
      expires_at: updated.shareExpiresAt,
      url: `${req.protocol}://${req.get("host")}/share/${token}`
    });
  } catch (error) {
    console.error("[publicShare] create share failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});

// GET /api/public/share/:token - 匿名获取分享内容
publicShareRouter.get("/:token", async (req, res) => {
  const token = req.params.token;
  const result = await findSharedItem(token);
  if (!result) {
    return res.status(404).json({ error: "NOT_FOUND", message: "分享链接不存在" });
  }

  const { type, item } = result;
  if (isShareExpired(item)) {
    return res.status(410).json({ error: "SHARE_EXPIRED", message: "分享链接已失效" });
  }

  try {
    if (type === "task") {
      const subtasks = await prisma.task.findMany({
        where: { parentTaskId: item.id, deletedAt: null }
      });
      const comments = await prisma.comment.findMany({
        where: { taskId: item.id },
        orderBy: { createdAt: "desc" },
        include: { user: true }
      });

      return res.json({
        type: "task",
        item: serializeTask(item),
        owner_name: item.user?.displayName || "",
        subtasks: subtasks.map(serializeTask),
        comments: comments.map(serializeComment)
      });
    }

    const comments = await prisma.noteComment.findMany({
      where: { noteId: item.id },
      orderBy: { createdAt: "desc" },
      include: { user: true }
    });

    return res.json({
      type: "note",
      item: serializeNote(item),
      owner_name: item.user?.displayName || "",
      comments: comments.map(serializeComment)
    });
  } catch (error) {
    console.error("[publicShare] get share failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});

// POST /api/public/share/:token/comments - 匿名评论
publicShareRouter.post("/:token/comments", async (req, res) => {
  const schema = z.object({
    content: z.string().min(1).max(5000),
    visitor_token: z.string().min(8).optional(),
    visitor_name: z.string().max(50).optional().nullable()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const result = await findSharedItem(req.params.token);
  if (!result) return res.status(404).json({ error: "NOT_FOUND" });

  const { type, item } = result;
  if (isShareExpired(item)) return res.status(410).json({ error: "SHARE_EXPIRED" });

  const visitorToken = ensureVisitorToken(req);
  const visitorName = (parsed.data.visitor_name || "访客").slice(0, 50);
  const content = parsed.data.content;

  try {
    let comment;
    if (type === "task") {
      comment = await prisma.comment.create({
        data: {
          taskId: item.id,
          content,
          visitorToken,
          visitorName,
          mentions: []
        },
        include: { user: true }
      });
    } else {
      comment = await prisma.noteComment.create({
        data: {
          noteId: item.id,
          content,
          visitorToken,
          visitorName,
          mentions: []
        },
        include: { user: true }
      });
    }

    await prisma.sharedActionLog.create({
      data: {
        shareToken: req.params.token,
        targetType: type,
        targetId: item.id,
        visitorToken,
        visitorName,
        actionType: "comment",
        payload: { commentId: comment.id, preview: content.slice(0, 100) }
      }
    });

    await notifyOwner(item.userId, {
      type: "public_share_comment",
      title: type === "task" ? "你的约定收到新评论" : "你的心签收到新评论",
      body: `${visitorName}：${content.slice(0, 80)}`,
      shareToken: req.params.token,
      targetType: type,
      targetId: item.id,
      visitorToken,
      visitorName,
      link: type === "task" ? `/tasks?taskId=${item.id}` : `/notes?noteId=${item.id}`
    });

    return res.status(201).json({
      comment: serializeComment(comment),
      visitor_token: visitorToken
    });
  } catch (error) {
    console.error("[publicShare] comment failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});

// POST /api/public/share/:token/toggle - 匿名勾选/取消勾选（仅 task）
publicShareRouter.post("/:token/toggle", async (req, res) => {
  const schema = z.object({
    checked: z.boolean(),
    visitor_token: z.string().min(8).optional(),
    visitor_name: z.string().max(50).optional().nullable()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const result = await findSharedItem(req.params.token);
  if (!result) return res.status(404).json({ error: "NOT_FOUND" });
  if (result.type !== "task") return res.status(400).json({ error: "INVALID_TYPE", message: "仅支持约定" });

  const { item } = result;
  if (isShareExpired(item)) return res.status(410).json({ error: "SHARE_EXPIRED" });

  const visitorToken = ensureVisitorToken(req);
  const visitorName = (parsed.data.visitor_name || "访客").slice(0, 50);
  const checked = parsed.data.checked;
  const nextStatus = checked ? "DONE" : "TODO";

  try {
    const updated = await prisma.task.update({
      where: { id: item.id },
      data: {
        status: nextStatus,
        completedAt: checked ? new Date() : null
      }
    });

    await prisma.sharedActionLog.create({
      data: {
        shareToken: req.params.token,
        targetType: "task",
        targetId: item.id,
        visitorToken,
        visitorName,
        actionType: "toggle",
        payload: { checked, status: nextStatus }
      }
    });

    await notifyOwner(item.userId, {
      type: "public_share_toggle",
      title: "有人更新了约定的完成状态",
      body: `${visitorName} ${checked ? "勾选了" : "取消了"}「${item.title}」`,
      shareToken: req.params.token,
      targetType: "task",
      targetId: item.id,
      visitorToken,
      visitorName,
      link: `/tasks?taskId=${item.id}`
    });

    return res.json({
      task: serializeTask(updated),
      visitor_token: visitorToken
    });
  } catch (error) {
    console.error("[publicShare] toggle failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});

// POST /api/public/share/:token/subscribe - 匿名订阅通知
publicShareRouter.post("/:token/subscribe", async (req, res) => {
  const schema = z.object({
    visitor_token: z.string().min(8).optional(),
    visitor_name: z.string().max(50).optional().nullable(),
    email: z.string().email().optional().nullable(),
    push_subscription: z.any().optional().nullable()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const result = await findSharedItem(req.params.token);
  if (!result) return res.status(404).json({ error: "NOT_FOUND" });

  const { type, item } = result;
  if (isShareExpired(item)) return res.status(410).json({ error: "SHARE_EXPIRED" });

  const visitorToken = ensureVisitorToken(req);
  const visitorName = (parsed.data.visitor_name || "访客").slice(0, 50);

  try {
    await prisma.sharedActionLog.create({
      data: {
        shareToken: req.params.token,
        targetType: type,
        targetId: item.id,
        visitorToken,
        visitorName,
        actionType: "subscribe",
        payload: {
          email: parsed.data.email,
          hasPushSubscription: !!parsed.data.push_subscription
        }
      }
    });

    return res.json({
      subscribed: true,
      visitor_token: visitorToken
    });
  } catch (error) {
    console.error("[publicShare] subscribe failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});
