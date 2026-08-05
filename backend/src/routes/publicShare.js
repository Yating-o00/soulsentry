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
  const visitorName = comment.visitorName || (comment.visitorToken ? `访客 #${comment.visitorToken.slice(0, 6)}` : null);
  return {
    id: comment.id,
    task_id: comment.taskId,
    note_id: comment.noteId,
    content: comment.content,
    mentions: comment.mentions || [],
    created_by: comment.user?.email || visitorName || "访客",
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

function escapeICS(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function toICSDate(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function generateICS(item, type) {
  const title = escapeICS(item.title || "未命名");
  const description = escapeICS(item.description || item.plainText || "");
  const uid = `${item.id}@soulsentry.cn`;
  const now = toICSDate(new Date());

  const startRaw = item.reminderTime || item.dueAt || null;
  const startDate = startRaw ? new Date(startRaw) : new Date();
  if (isNaN(startDate.getTime())) startDate.setTime(Date.now());
  const start = toICSDate(startDate);

  const endRaw = item.endTime || null;
  let endDate = endRaw ? new Date(endRaw) : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (isNaN(endDate.getTime())) endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const end = toICSDate(endDate);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SoulSentry//CN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:SoulSentry",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${title}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
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

// GET /api/public/share/:token/ics - 下载日历事件文件
publicShareRouter.get("/:token/ics", async (req, res) => {
  const result = await findSharedItem(req.params.token);
  if (!result) {
    return res.status(404).type("text/plain").send("分享不存在");
  }
  if (isShareExpired(result.item)) {
    return res.status(410).type("text/plain").send("分享链接已失效");
  }

  try {
    const { type, item } = result;
    const ics = generateICS(item, type);
    const filename = `${type === "task" ? "约定" : "心签"}-${(item.title || "未命名").slice(0, 20)}.ics`;

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    // inline 让手机浏览器直接把 .ics 交给系统日历；桌面端会回退为下载
    res.setHeader("Content-Disposition", 'inline; filename="soulsentry.ics"');
    return res.send(ics);
  } catch (error) {
    console.error("[publicShare] generate ics failed:", error);
    return res.status(500).type("text/plain").send("生成日历文件失败");
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

// POST /api/public/share/:token/toggle - 匿名勾选/取消勾选（仅 task，支持子约定）
publicShareRouter.post("/:token/toggle", async (req, res) => {
  const schema = z.object({
    checked: z.boolean(),
    subtask_id: z.string().optional().nullable(),
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
  const subtaskId = parsed.data.subtask_id;
  const nextStatus = checked ? "DONE" : "TODO";

  try {
    let updated;
    let targetTitle = item.title;
    let payload = { checked, status: nextStatus };

    if (subtaskId) {
      const subtask = await prisma.task.findFirst({
        where: { id: subtaskId, parentTaskId: item.id, deletedAt: null }
      });
      if (!subtask) {
        return res.status(400).json({ error: "INVALID_SUBTASK", message: "子约定不存在" });
      }
      updated = await prisma.task.update({
        where: { id: subtaskId },
        data: {
          status: nextStatus,
          completedAt: checked ? new Date() : null
        }
      });
      targetTitle = subtask.title;
      payload = { checked, status: nextStatus, subtaskId, subtaskTitle: subtask.title, parentTaskId: item.id };
    } else {
      updated = await prisma.task.update({
        where: { id: item.id },
        data: {
          status: nextStatus,
          completedAt: checked ? new Date() : null
        }
      });
    }

    await prisma.sharedActionLog.create({
      data: {
        shareToken: req.params.token,
        targetType: "task",
        targetId: item.id,
        visitorToken,
        visitorName,
        actionType: "toggle",
        payload
      }
    });

    await notifyOwner(item.userId, {
      type: "public_share_toggle",
      title: subtaskId ? "有人更新了子约定的完成状态" : "有人更新了约定的完成状态",
      body: `${visitorName} ${checked ? "勾选了" : "取消了"}「${targetTitle}」`,
      shareToken: req.params.token,
      targetType: "task",
      targetId: item.id,
      visitorToken,
      visitorName,
      link: `/tasks?taskId=${item.id}`
    });

    return res.json({
      task: serializeTask(updated),
      subtask_id: subtaskId || null,
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

// POST /api/public/share/:token/import - 登录用户导入分享内容到个人列表
publicShareRouter.post("/:token/import", requireAuth, async (req, res) => {
  const result = await findSharedItem(req.params.token);
  if (!result) return res.status(404).json({ error: "NOT_FOUND" });

  const { type, item } = result;
  if (isShareExpired(item)) return res.status(410).json({ error: "SHARE_EXPIRED" });

  try {
    const ownerName = item.user?.displayName || item.user?.email || "未知分享者";
    const sharedFromTag = `来自 ${ownerName} 的分享`;
    let imported;
    if (type === "task") {
      imported = await prisma.task.create({
        data: {
          userId: req.user.id,
          title: `[${sharedFromTag}] ${item.title}`,
          description: [item.description || "", `（${sharedFromTag}）`].filter(Boolean).join("\n\n"),
          status: "TODO",
          priority: item.priority || "medium",
          category: item.category || "other",
          dueAt: item.dueAt,
          reminderTime: item.reminderTime,
          endTime: item.endTime,
          isAllDay: item.isAllDay,
          tags: item.tags,
          reminderStrategy: item.reminderStrategy,
          metadata: {
            ...(item.metadata || {}),
            importedFromShare: true,
            sharedByName: ownerName,
            sharedByUserId: item.userId,
            originalTaskId: item.id,
            originalOwnerId: item.userId
          }
        }
      });
    } else {
      imported = await prisma.note.create({
        data: {
          userId: req.user.id,
          title: `[${sharedFromTag}] ${item.title || ""}`,
          content: item.content,
          plainText: [item.plainText || "", `（${sharedFromTag}）`].filter(Boolean).join("\n\n"),
          tags: item.tags,
          metadata: {
            ...(item.metadata || {}),
            importedFromShare: true,
            sharedByName: ownerName,
            sharedByUserId: item.userId,
            originalNoteId: item.id,
            originalOwnerId: item.userId
          }
        }
      });
    }

    await prisma.sharedActionLog.create({
      data: {
        shareToken: req.params.token,
        targetType: type,
        targetId: item.id,
        visitorToken: req.user.id,
        visitorName: req.user.displayName || req.user.email || "注册用户",
        actionType: "import",
        payload: { importedId: imported.id, importerId: req.user.id }
      }
    });

    await notifyOwner(item.userId, {
      type: "public_share_import",
      title: `有人把${type === "task" ? "约定" : "心签"}添加到了个人列表`,
      body: `${req.user.displayName || req.user.email || "某用户"} 保存了「${type === "task" ? item.title : (item.title || "心签")}」`,
      shareToken: req.params.token,
      targetType: type,
      targetId: item.id,
      link: type === "task" ? `/tasks?taskId=${item.id}` : `/notes?noteId=${item.id}`
    });

    return res.json({
      type,
      item: type === "task" ? serializeTask(imported) : serializeNote(imported)
    });
  } catch (error) {
    console.error("[publicShare] import failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});

// GET /api/public/share/:token/logs - 获取分享的合作动态（仅分享者）
publicShareRouter.get("/:token/logs", requireAuth, async (req, res) => {
  const result = await findSharedItem(req.params.token);
  if (!result) return res.status(404).json({ error: "NOT_FOUND" });

  const { type, item } = result;
  if (item.userId !== req.user.id) {
    return res.status(403).json({ error: "FORBIDDEN", message: "仅分享者可查看合作动态" });
  }

  try {
    const logs = await prisma.sharedActionLog.findMany({
      where: { shareToken: req.params.token },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    const uniqueVisitors = new Set();
    const comments = [];
    const toggles = [];
    const imports = [];

    for (const log of logs) {
      uniqueVisitors.add(log.visitorToken);
      if (log.actionType === "comment") comments.push(log);
      else if (log.actionType === "toggle") toggles.push(log);
      else if (log.actionType === "import") imports.push(log);
    }

    return res.json({
      type,
      item_id: item.id,
      visitor_count: uniqueVisitors.size,
      comment_count: comments.length,
      toggle_count: toggles.length,
      import_count: imports.length,
      recent_logs: logs.slice(0, 20).map((log) => ({
        id: log.id,
        action_type: log.actionType,
        visitor_name: log.visitorName,
        visitor_token: log.visitorToken,
        payload: log.payload,
        created_date: log.createdAt
      }))
    });
  } catch (error) {
    console.error("[publicShare] get logs failed:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: error.message });
  }
});
