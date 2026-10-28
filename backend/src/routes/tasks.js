import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { maybeAutoExecute } from "../services/autoAutomation.js";
import { checkTextSecurityAsync } from "../services/contentSecurity.js";
import { suggestTaskSplit } from "../services/splitTask.js";
import { assertAICredits, chargeAICredits } from "../services/aiCredits.js";
import {
  assertTaskAccess,
  describeTaskChange,
  getSharedTaskIds,
  notifyTaskParties,
  taskAccess,
  withSharedInfo
} from "../services/taskSharing.js";
import { computeNextReminderTime, parseRecurrenceFromText } from "../lib/recurrence.js";
import { logBehavior } from "../lib/behavior.js";

export const tasksRouter = Router();

// 子约定智能建议的 AI 调用扣费（与 functions.js AI_CALL_COSTS.task_parse 同档）
const TASK_SPLIT_COST = 2;

const isoDateTime = z.string().refine(
  (v) => !Number.isNaN(Date.parse(v)),
  { message: "Invalid datetime" }
);

const taskInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.string().optional(),
  priority: z.string().min(1).max(20).optional(),
  category: z.string().optional(),
  due_at: isoDateTime.optional().nullable(),
  reminder_time: isoDateTime.optional().nullable(),
  end_time: isoDateTime.optional().nullable(),
  is_all_day: z.boolean().optional(),
  parent_task_id: z.string().optional().nullable(),
  gcal_sync_enabled: z.boolean().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  completed_at: isoDateTime.optional().nullable(),
  deleted_at: isoDateTime.optional().nullable(),
  pinned_at: isoDateTime.optional().nullable(),
  tags: z.any().optional(),
  reminder_strategy: z.any().optional(),
  metadata: z.any().optional()
}).passthrough();

const taskBatchInputSchema = z.array(taskInputSchema).min(1).max(100);

const KNOWN_TASK_FIELDS = new Set([
  "title",
  "description",
  "status",
  "priority",
  "category",
  "due_at",
  "reminder_time",
  "end_time",
  "is_all_day",
  "parent_task_id",
  "gcal_sync_enabled",
  "progress",
  "completed_at",
  "deleted_at",
  "tags",
  "reminder_strategy",
  "metadata",
  "done_today",
  "pinned_at"
]);

tasksRouter.use(requireAuth);

function toPrismaTaskStatus(status) {
  const normalized = String(status || "TODO").toUpperCase();
  if (normalized === "PENDING") return "TODO";
  if (normalized === "COMPLETED") return "DONE";
  if (normalized === "DONE") return "DONE";
  if (normalized === "IN_PROGRESS" || normalized === "RUNNING" || normalized === "BLOCKED") return "IN_PROGRESS";
  if (["TODO", "IN_PROGRESS", "DONE", "ARCHIVED"].includes(normalized)) return normalized;
  return "TODO";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getTaskExtraFields(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !KNOWN_TASK_FIELDS.has(key) && value !== undefined)
  );
}

function mergeTaskMetadata(existingMetadata, nextMetadata, extraFields = {}) {
  const baseMetadata = nextMetadata === undefined ? existingMetadata : nextMetadata;
  const hasExtraFields = Object.keys(extraFields).length > 0;

  if (baseMetadata === undefined && !hasExtraFields) {
    return undefined;
  }

  const normalized = isPlainObject(baseMetadata)
    ? { ...baseMetadata }
    : baseMetadata === undefined || baseMetadata === null
      ? {}
      : { _value: baseMetadata };

  const previousExtraFields = isPlainObject(normalized._extraFields)
    ? normalized._extraFields
    : {};

  if (hasExtraFields || Object.keys(previousExtraFields).length > 0) {
    normalized._extraFields = {
      ...previousExtraFields,
      ...extraFields
    };
  }

  return normalized;
}

function getSerializedTaskExtraFields(task) {
  const extraFields = isPlainObject(task?.metadata?._extraFields)
    ? task.metadata._extraFields
    : {};

  return Object.fromEntries(
    Object.entries(extraFields).filter(([, value]) => value !== undefined)
  );
}

export function serializeTask(task) {
  const extraFields = getSerializedTaskExtraFields(task);

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
    pinned_at: task.pinnedAt,
    tags: task.tags,
    reminder_strategy: task.reminderStrategy,
    share_token: task.shareToken,
    share_enabled: task.shareEnabled,
    share_expires_at: task.shareExpiresAt,
    reminder_sent: !!extraFields.reminder_sent_at,
    reminder_sent_at: extraFields.reminder_sent_at || null,
    end_reminder_sent: !!(extraFields.end_reminder_sent_at && task.endTime && new Date(extraFields.end_reminder_sent_at).getTime() >= new Date(task.endTime).getTime()),
    // 重复约定：今天是否已打卡（按北京日期比对）
    done_today: extraFields.recurrence_last_done === new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
    ...extraFields,
    metadata: task.metadata,
    created_date: task.createdAt,
    updated_date: task.updatedAt
  };
}

// ── 子约定完成度 → 父约定进度条 ──
// 父约定进度 = 其存活直接子约定中 DONE 的占比；子约定的完成/新建/删除/换父后调用。
// 父约定已无存活子约定时不改写（保留人工设置的进度）；失败只告警，不影响主流程。
export async function syncParentProgress(parentId) {
  if (!parentId) return;
  try {
    const children = await prisma.task.findMany({
      where: { parentTaskId: parentId, deletedAt: null },
      select: { status: true }
    });
    if (children.length === 0) return;
    const done = children.filter((c) => c.status === "DONE").length;
    await prisma.task.update({
      where: { id: parentId },
      data: { progress: Math.round((done / children.length) * 100) }
    });
  } catch (err) {
    console.warn(`[tasks] 同步父约定进度失败 parent=${parentId}:`, err?.message || err);
  }
}

function buildTaskCreateData(userId, payload) {
  const extraFields = getTaskExtraFields(payload);
  // 兜底：原文含重复语义而前端未显式传 repeat_rule 时自动识别——
  // 否则 cron 首次提醒后不推进排期，重复约定退化为一次性提醒（如"每天晚上6-7点吃药"只响一天）
  if (!extraFields.repeat_rule) {
    const rec = parseRecurrenceFromText(payload.description) || parseRecurrenceFromText(payload.title);
    if (rec) {
      extraFields.repeat_rule = rec.repeat_rule;
      extraFields.custom_recurrence = rec.custom_recurrence;
    }
  }
  const title = String(payload.title || "").trim();

  // 子约定的时间若早于现在（通常是前端继承自父约定的旧排期），一律不带入：
  // 任务在提醒时刻之后才创建，旧提醒本就无法送达，否则创建当刻会被到点提醒 / 截止跟进 /
  // 逾期衰减三个发送器各响一次（它们的去重标记互不相同），形成连续多次打扰
  const isSubtask = Boolean(payload.parent_task_id);
  const keepTime = (iso) => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return null;
    if (isSubtask && t <= Date.now()) return null;
    return new Date(t);
  };

  // 打卡约定未设定停止时间（无 end_time）时 = 开放式每日重复约定：
  // 每天提醒打卡，打卡后由 /checkins 滚存到下一期；显式设置的 repeat_rule / end_time 优先
  const openEndedCheckin = payload.category === "checkin" && !payload.end_time;
  if (openEndedCheckin && (!extraFields.repeat_rule || extraFields.repeat_rule === "none")) {
    extraFields.repeat_rule = "daily";
  }

  let reminderTime = keepTime(payload.reminder_time);
  if (openEndedCheckin && !reminderTime) {
    // 未设提醒时间的开放式打卡约定：默认每天 21:00 提醒，今天的已过则明天开始
    const anchor = new Date();
    anchor.setHours(21, 0, 0, 0);
    if (anchor.getTime() <= Date.now()) anchor.setDate(anchor.getDate() + 1);
    reminderTime = anchor;
  }

  return {
    userId,
    title: title.slice(0, 120),
    description: payload.description,
    status: toPrismaTaskStatus(payload.status),
    priority: payload.priority || "medium",
    category: payload.category,
    dueAt: keepTime(payload.due_at),
    reminderTime,
    endTime: keepTime(payload.end_time),
    isAllDay: Boolean(payload.is_all_day),
    parentTaskId: payload.parent_task_id || null,
    gcalSyncEnabled: Boolean(payload.gcal_sync_enabled),
    progress: payload.progress ?? 0,
    completedAt: payload.completed_at ? new Date(payload.completed_at) : null,
    deletedAt: payload.deleted_at ? new Date(payload.deleted_at) : null,
    tags: payload.tags,
    reminderStrategy: payload.reminder_strategy,
    metadata: mergeTaskMetadata(undefined, payload.metadata, extraFields)
  };
}

function parseSort(sort = "-created_date") {
  const value = String(sort || "-created_date");
  const order = value.startsWith("-") ? "desc" : "asc";
  const key = value.replace(/^[-+]/, "");
  const mapping = {
    created_date: "createdAt",
    updated_date: "updatedAt",
    reminder_time: "reminderTime",
    due_at: "dueAt",
    title: "title"
  };
  return { [mapping[key] || "createdAt"]: order };
}

function toDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "(空)";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldLabel(field) {
  const labels = {
    title: "标题",
    description: "描述",
    status: "状态",
    priority: "优先级",
    category: "分类",
    due_at: "截止时间",
    reminder_time: "提醒时间",
    end_time: "结束时间",
    completed_at: "完成时间",
    deleted_at: "删除时间",
    progress: "进度",
    attachments: "附件",
    dependencies: "依赖",
    notes: "笔记",
    revisions: "版本"
  };
  return labels[field] || field;
}

async function createTaskChangeLog(userId, task, changeType, payload = {}, previous = null) {
  const changedFields = Object.keys(payload || {}).filter((key) => key !== "metadata");
  const changesDetail = changedFields.map((field) => ({
    field,
    field_label: fieldLabel(field),
    old_value: toDisplayValue(previous?.[field]),
    new_value: toDisplayValue(payload?.[field])
  }));

  await prisma.taskChangeLog.create({
    data: {
      userId,
      taskId: task.id,
      parentTaskId: task.parentTaskId,
      changeType,
      taskTitle: task.title,
      changedFields,
      changesDetail
    }
  });
}

tasksRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const orderBy = [{ pinnedAt: "desc" }, parseSort(req.query.sort || req.query.orderBy)]; // 置顶优先（SQLite 中 DESC 的 NULL 沉底）
  // 共有约定：本人所有 + 作为成员参与的约定（含其子约定）
  const sharedIds = await getSharedTaskIds(req.user.id);
  const where = sharedIds.length
    ? { OR: [{ userId: req.user.id }, { id: { in: sharedIds } }, { parentTaskId: { in: sharedIds } }] }
    : { userId: req.user.id };
  let needSharedInclude = sharedIds.length > 0;

  if (req.query.id) where.id = String(req.query.id);
  if (req.query.parent_task_id !== undefined) {
    const value = String(req.query.parent_task_id).trim();
    if (value === "all") {
      // 不过滤
    } else if (value) {
      // 指定父约定：先校验访问权；共有约定的子约定可能分属双方，不再按 userId 过滤
      const parent = await prisma.task.findUnique({ where: { id: value }, include: { members: true } });
      if (!taskAccess(parent, req.user.id)) {
        return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
      }
      if (parent.members.length > 0 || parent.userId !== req.user.id) {
        for (const key of Object.keys(where)) delete where[key];
        needSharedInclude = true;
      }
      where.parentTaskId = value;
    } else {
      where.parentTaskId = null;
    }
  } else {
    // 默认只返回顶层约定，避免子约定出现在列表中
    where.parentTaskId = null;
  }
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.status) where.status = toPrismaTaskStatus(req.query.status);

  // 时间范围查询（日程占用）：start/end 为 ISO 时间，命中 reminderTime/dueAt 落在 [start, end) 的约定；
  // 用于规划避障等场景，需包含各级子约定，故不显式过滤 parentTaskId。
  // 容忍未编码的 "+"（URL 规范里 + 会被解码成空格）
  const parseRangeDate = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const d = new Date(String(v).replace(" ", "+"));
    return isNaN(d.getTime()) ? null : d;
  };
  const rangeStart = parseRangeDate(req.query.start);
  const rangeEnd = parseRangeDate(req.query.end);
  if (rangeStart && !isNaN(rangeStart.getTime()) && rangeEnd && !isNaN(rangeEnd.getTime())) {
    delete where.parentTaskId;
    const rangeCond = [
      { reminderTime: { gte: rangeStart, lt: rangeEnd } },
      { dueAt: { gte: rangeStart, lt: rangeEnd } }
    ];
    // 与「共有约定」的 OR 条件共存：原 OR 收进 AND，避免相互覆盖
    if (Array.isArray(where.OR)) {
      where.AND = [{ OR: where.OR }, { OR: rangeCond }];
      delete where.OR;
    } else {
      where.OR = rangeCond;
    }
    if (!req.query.status) where.status = { notIn: ["DONE", "ARCHIVED"] };
  }

  // 默认不返回已删除任务，避免前端删除后“视觉上消失但刷新又回来”
  if (req.query.deleted_at === undefined) {
    where.deletedAt = null;
  } else {
    const deletedQuery = String(req.query.deleted_at).trim().toLowerCase();
    if (deletedQuery === "null" || deletedQuery === "false" || deletedQuery === "0") {
      where.deletedAt = null;
    } else if (deletedQuery === "not_null" || deletedQuery === "true" || deletedQuery === "1") {
      where.deletedAt = { not: null };
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy,
    take: Number.isFinite(limit) ? limit : 100,
    include: needSharedInclude ? { user: true, members: true } : undefined
  });

  return res.json(tasks.map((task) => {
    const role = task.userId === req.user.id ? "owner" : (taskAccess(task, req.user.id) || "member");
    return withSharedInfo(serializeTask(task), task, role);
  }));
});

tasksRouter.get("/:id", async (req, res) => {
  const result = await assertTaskAccess(req, res, req.params.id);
  if (!result) return;
  return res.json(withSharedInfo(serializeTask(result.task), result.task, result.role));
});

tasksRouter.post("/", async (req, res) => {
  const payload = taskInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  // 在他人共有约定下新建子约定：需是该约定的成员
  if (payload.data.parent_task_id) {
    const parent = await prisma.task.findUnique({ where: { id: payload.data.parent_task_id }, include: { members: true } });
    if (parent && parent.userId !== req.user.id && !taskAccess(parent, req.user.id)) {
      return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
    }
  }

  const task = await prisma.task.create({
    data: buildTaskCreateData(req.user.id, payload.data)
  });

  // 内容安全：异步 msgSecCheck——先返回创建结果，命中违规时自动隐藏该约定
  checkTextSecurityAsync(
    `${payload.data.title || ""}\n${payload.data.description || ""}`,
    req.user.id,
    () => {
      prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } }).catch(() => {});
    }
  );

  await createTaskChangeLog(
    req.user.id,
    task,
    task.parentTaskId ? "subtask_created" : "created",
    payload.data
  );

  // 新建子约定会稀释父约定的完成比：进度条同步为重算后的值
  await syncParentProgress(task.parentTaskId);

  // 主动检测可自动执行的部分，异步执行后待用户验收（不阻塞创建）
  void maybeAutoExecute(task, req.user.id, prisma);

  logBehavior(req.user.id, "task_created", { taskId: task.id, category: task.category, metadata: { via: task.parentTaskId ? "subtask" : "top" } });

  return res.status(201).json(serializeTask(task));
});

tasksRouter.post("/batch", async (req, res) => {
  const payload = taskBatchInputSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const tasks = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const item of payload.data) {
      const task = await tx.task.create({
        data: buildTaskCreateData(req.user.id, item)
      });

      await tx.taskChangeLog.create({
        data: {
          userId: req.user.id,
          taskId: task.id,
          parentTaskId: task.parentTaskId,
          changeType: task.parentTaskId ? "subtask_created" : "created",
          taskTitle: task.title,
          changedFields: Object.keys(item || {}).filter((key) => key !== "metadata"),
          changesDetail: []
        }
      });

      created.push(task);
    }

    return created;
  });

  // 批量创建的子约定同样驱动父约定进度条
  const affectedParents = new Set(tasks.map((t) => t.parentTaskId).filter(Boolean));
  for (const parentId of affectedParents) {
    await syncParentProgress(parentId);
  }

  // 内容安全：异步逐条 msgSecCheck——先返回创建结果，命中违规的约定自动隐藏
  tasks.forEach((task, idx) => {
    const item = payload.data[idx] || {};
    checkTextSecurityAsync(
      `${item.title || ""}\n${item.description || ""}`,
      req.user.id,
      () => {
        prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } }).catch(() => {});
      }
    );
  });

  logBehavior(req.user.id, "task_created", { metadata: { via: "batch", count: tasks.length } });

  return res.status(201).json(tasks.map(serializeTask));
});

tasksRouter.post("/:id/settle-knowledge", async (req, res) => {
  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;
  const task = access.task;

  // 拉全量约定（含各级子约定）构建沉淀快照：返还时据此完整重建
  const allTasks = await prisma.task.findMany({
    where: { userId: req.user.id, deletedAt: null },
    select: {
      id: true, title: true, description: true, status: true, priority: true,
      completedAt: true, parentTaskId: true,
      reminderTime: true, endTime: true, dueAt: true, isAllDay: true,
      category: true, tags: true, metadata: true
    }
  });
  const childrenOf = new Map();
  const byId = new Map();
  for (const t of allTasks) {
    byId.set(t.id, t);
    if (t.parentTaskId) {
      if (!childrenOf.has(t.parentTaskId)) childrenOf.set(t.parentTaskId, []);
      childrenOf.get(t.parentTaskId).push(t);
    }
  }
  const buildNode = (t) => ({
    title: t.title,
    description: t.description,
    status: t.status === "DONE" ? "completed" : t.status === "TODO" ? "pending" : t.status.toLowerCase(),
    priority: t.priority,
    completed_at: t.completedAt,
    children: (childrenOf.get(t.id) || []).map(buildNode)
  });
  const parentTask = task.parentTaskId ? byId.get(task.parentTaskId) : null;

  const snapshot = {
    source: "task",
    settled_at: new Date().toISOString(),
    task: {
      title: task.title,
      description: task.description,
      priority: task.priority,
      category: task.category,
      tags: Array.isArray(task.tags) ? task.tags : [],
      reminder_time: task.reminderTime,
      end_time: task.endTime,
      due_at: task.dueAt,
      is_all_day: task.isAllDay,
      parent_task_id: task.parentTaskId,
      parent_title: parentTask?.title || null
    },
    subtasks: (childrenOf.get(task.id) || []).map(buildNode)
  };

  const kb = await prisma.knowledgeBase.create({
    data: {
      userId: req.user.id,
      title: task.title,
      content: task.description || task.title,
      sourceType: "task",
      sourceId: task.id,
      tags: ["约定沉淀", ...(Array.isArray(task.tags) ? task.tags : [])],
      category: "约定沉淀",
      snapshot
    }
  });

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "DONE",
      completedAt: new Date(),
      metadata: { ...(task.metadata || {}), settled_as_knowledge: true, knowledge_base_id: kb.id }
    }
  });

  // 被沉淀的约定本身若是子约定，同样计入父约定进度条
  await syncParentProgress(task.parentTaskId);

  return res.status(201).json({ knowledge_base_id: kb.id, task: serializeTask(updated) });
});

tasksRouter.post("/:id/split", async (req, res) => {
  const task = await prisma.task.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!task) {
    return res.status(404).json({ error: "NOT_FOUND", message: "任务不存在" });
  }

  // 子约定智能建议是 AI 调用：预检余额（不足 402），成功后扣 2 点
  try {
    await assertAICredits(req.user.id, TASK_SPLIT_COST, "task_split");
  } catch (e) {
    if (e?.code === "INSUFFICIENT_CREDITS") {
      return res.status(402).json({ error: "INSUFFICIENT_CREDITS", message: e.message, balance: e.balance, required: e.required });
    }
    throw e;
  }

  const result = await suggestTaskSplit(task);

  try {
    await chargeAICredits({ userId: req.user.id, cost: TASK_SPLIT_COST, feature: "task_split", description: "子约定智能建议" });
  } catch (e) {
    if (e?.code === "INSUFFICIENT_CREDITS") {
      console.warn(`[tasks/split] 结算时余额不足（余额 ${e.balance}），本次放行`);
    } else {
      console.error("[tasks/split] 扣点失败:", e?.message || e);
    }
  }

  return res.json(result);
});

tasksRouter.patch("/:id", async (req, res) => {
  const payload = taskInputSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;
  const existing = access.task;

  // 共有成员可共同管理内容，但删除与归属变更仍属创建者
  if (access.role === "member" && payload.data.deleted_at !== undefined) {
    return res.status(403).json({ error: "FORBIDDEN", message: "共有约定仅创建者可删除" });
  }
  if (access.role === "member" && payload.data.parent_task_id !== undefined) {
    return res.status(403).json({ error: "FORBIDDEN", message: "共有成员不能变更约定的归属" });
  }

  const extraFields = getTaskExtraFields(payload.data);
  const prevExtra = isPlainObject(existing.metadata?._extraFields) ? existing.metadata._extraFields : {};
  // 兜底：文本含重复语义但未设 repeat_rule 时自动识别（前端智能创建链路不总是显式传），
  // 存量的一次性任务被编辑保存后也能激活为重复约定
  if (extraFields.repeat_rule === undefined && !prevExtra.repeat_rule) {
    const rec = parseRecurrenceFromText(payload.data.description ?? existing.description)
      || parseRecurrenceFromText(payload.data.title ?? existing.title);
    if (rec) {
      extraFields.repeat_rule = rec.repeat_rule;
      extraFields.custom_recurrence = rec.custom_recurrence;
    }
  }
  let nextMetadata = payload.data.metadata === undefined && Object.keys(extraFields).length === 0
    ? undefined
    : mergeTaskMetadata(existing.metadata, payload.data.metadata, extraFields);

  // ── 短延后序列归一化：统一三端顺延行为 ──
  // 短延后（≤30分钟）按 5→15 分钟推进；当天第 3 次短延后不再打扰，转入 21:00 晚间回顾；
  // 长顺延（>30分钟）重置序列。snooze_until/snooze_reason 等随 passthrough 进 extraFields，这里补序列字段。
  const chinaToday = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const snoozeNormalize = {};
  let cappedReminderTime = null;
  const snoozeTarget = payload.data.reminder_time || payload.data.snooze_until;
  const isSnoozeIntent = payload.data.snooze_until !== undefined || payload.data.status === "snoozed";

  if (isSnoozeIntent && snoozeTarget) {
    const targetMs = new Date(snoozeTarget).getTime();
    const intervalMin = (targetMs - Date.now()) / 60000;
    const prevCount = prevExtra.snooze_day === chinaToday ? Number(prevExtra.short_snooze_count || 0) : 0;
    const reason = payload.data.snooze_reason !== undefined
      ? payload.data.snooze_reason
      : (prevExtra.snooze_reason || null);

    if (intervalMin > 0 && intervalMin <= 30) {
      const n = prevCount + 1;
      if (n >= 3) {
        // 连续短延后已达两次：当天静默，晚间 21:00 一次回顾
        const evening = new Date();
        evening.setHours(21, 0, 0, 0);
        if (evening.getTime() <= Date.now()) evening.setDate(evening.getDate() + 1);
        Object.assign(snoozeNormalize, {
          short_snooze_count: n,
          snooze_evening_review: true,
          snooze_until: evening.toISOString(),
          snooze_day: chinaToday,
          snooze_reason: reason
        });
        cappedReminderTime = evening.toISOString();
      } else {
        Object.assign(snoozeNormalize, {
          short_snooze_count: n,
          snooze_evening_review: false,
          snooze_until: new Date(targetMs).toISOString(),
          snooze_day: chinaToday,
          snooze_reason: reason
        });
      }
    } else if (intervalMin > 30) {
      Object.assign(snoozeNormalize, {
        short_snooze_count: 0,
        snooze_evening_review: false,
        snooze_until: new Date(targetMs).toISOString(),
        snooze_day: chinaToday,
        snooze_reason: reason
      });
    }
  }

  // 「待安排」约定上补设了时间 → 标记已排期，进入正常的提醒/逾期语义
  const arrangingTime = !!(payload.data.reminder_time || payload.data.end_time || payload.data.due_at);
  if (arrangingTime && isPlainObject(prevExtra.time_plan) && prevExtra.time_plan.arranged === false) {
    snoozeNormalize.time_plan = { ...prevExtra.time_plan, arranged: true };
  }

  // ── 重复约定完成语义：打卡不杀系列 ──
  // 勾选完成 = 记录"今天已打卡"（按北京日期），约定保持活跃并把当次排期推进到下一周期；
  // 取消完成 = 清掉今天的打卡记录。系列永不因单次打卡结束，也不产生逾期压力。
  let nextStatusForUpdate = payload.data.status ? toPrismaTaskStatus(payload.data.status) : undefined;
  let nextCompletedAtForUpdate = payload.data.completed_at === undefined ? undefined : (payload.data.completed_at ? new Date(payload.data.completed_at) : null);
  let nextReminderTimeForUpdate = cappedReminderTime
    ? new Date(cappedReminderTime)
    : payload.data.reminder_time === undefined ? undefined : (payload.data.reminder_time ? new Date(payload.data.reminder_time) : null);
  let nextEndTimeForUpdate = payload.data.end_time === undefined ? undefined : (payload.data.end_time ? new Date(payload.data.end_time) : null);

  const recurringRule = ["daily", "weekly", "monthly", "custom"].includes(prevExtra.repeat_rule) ? prevExtra.repeat_rule : null;

  // 状态直接置完成/还原且未显式传 completed_at：自动记录/清除完成时间。
  // 「今日完成的子约定」分享呈现、完成度统计都依赖该时间戳（重复约定分支在下面另行处理）。
  if (!recurringRule && payload.data.completed_at === undefined && payload.data.status !== undefined) {
    const requested = toPrismaTaskStatus(payload.data.status);
    if (requested === "DONE" && existing.status !== "DONE") {
      nextCompletedAtForUpdate = new Date();
    } else if (requested !== "DONE" && existing.status === "DONE") {
      nextCompletedAtForUpdate = null;
    }
  }
  if (recurringRule && payload.data.status !== undefined) {
    const requestedStatus = toPrismaTaskStatus(payload.data.status);
    const recurrenceDoneToday = prevExtra.recurrence_last_done === chinaToday;

    if (requestedStatus === "DONE" && existing.status !== "DONE") {
      snoozeNormalize.recurrence_last_done = chinaToday;
      snoozeNormalize.recurrence_done_count = Number(prevExtra.recurrence_done_count || 0) + 1;
      // 已打卡：本期核对唤回即刻停止
      snoozeNormalize.recurrence_checkback_anchor = null;
      snoozeNormalize.recurrence_checkback_count = 0;
      nextCompletedAtForUpdate = new Date();
      nextStatusForUpdate = existing.status; // 系列保持活跃，不置 DONE
      // 当次提醒尚未发出时提前打卡：直接把排期推进到下一期，今天不再打扰
      if (existing.reminderTime && existing.reminderTime.getTime() <= Date.now()) {
        const nextR = computeNextReminderTime(existing.reminderTime, recurringRule, prevExtra.custom_recurrence, new Date());
        if (nextR) {
          nextReminderTimeForUpdate = nextR;
          if (existing.endTime) {
            nextEndTimeForUpdate = new Date(existing.endTime.getTime() + (nextR.getTime() - existing.reminderTime.getTime()));
          }
        }
      }
    } else if (requestedStatus === "TODO" && recurrenceDoneToday) {
      snoozeNormalize.recurrence_last_done = null;
      nextCompletedAtForUpdate = null;
      nextStatusForUpdate = existing.status;
    }
  }

  // 重复约定的顺延/唤回一律不改写系列排期锚点：当次延后只记在 snooze_until 上，
  // 由唤回 cron 到点轻声提醒；明天及以后的提醒仍按原锚点到来（顺延 5 分钟不会把系列带成 18:05）
  if (recurringRule && isSnoozeIntent) {
    nextReminderTimeForUpdate = undefined;
  }

  // ── 轻轻放下：本周期内不再提醒 ──
  // 截止点：重复约定 = 下一期提醒锚点（本期自然结束）；一次性约定 = 今天 23:59（北京），封顶 7 天。
  // 写入 gentle_dismiss_until 后，到点提醒/顺延唤回/打卡核对/温和跟进/遗忘/逾期衰减全链路静默，
  // 打卡、重新延后等任何新交互都会自然覆盖该状态。
  if (payload.data.gentle_dismiss === true) {
    let untilMs = null;
    if (recurringRule) {
      const base = existing.reminderTime && existing.reminderTime.getTime() > Date.now()
        ? existing.reminderTime
        : computeNextReminderTime(existing.reminderTime || new Date(), recurringRule, prevExtra.custom_recurrence, new Date());
      untilMs = base ? base.getTime() : null;
    }
    if (!untilMs) {
      const endOfToday = new Date(Date.now() + 8 * 3600 * 1000);
      endOfToday.setUTCHours(15, 59, 59, 999); // 北京 23:59:59.999
      untilMs = endOfToday.getTime();
    }
    const capMs = Date.now() + 7 * 24 * 3600 * 1000;
    if (untilMs > capMs) untilMs = capMs;
    Object.assign(snoozeNormalize, {
      gentle_dismiss_until: new Date(untilMs).toISOString(),
      recurrence_checkback_anchor: null,
      recurrence_checkback_count: 0,
      snooze_until: null,
      snooze_evening_review: false
    });
  }

  if (Object.keys(snoozeNormalize).length > 0) {
    const base = nextMetadata === undefined
      ? (isPlainObject(existing.metadata) ? { ...existing.metadata } : {})
      : nextMetadata;
    const prevFields = isPlainObject(base._extraFields) ? base._extraFields : {};
    nextMetadata = { ...base, _extraFields: { ...prevFields, ...snoozeNormalize } };
  }

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      title: payload.data.title,
      description: payload.data.description,
      status: nextStatusForUpdate,
      priority: payload.data.priority,
      category: payload.data.category,
      dueAt: payload.data.due_at === undefined ? undefined : (payload.data.due_at ? new Date(payload.data.due_at) : null),
      reminderTime: nextReminderTimeForUpdate,
      endTime: nextEndTimeForUpdate,
      isAllDay: payload.data.is_all_day,
      parentTaskId: payload.data.parent_task_id === undefined ? undefined : (payload.data.parent_task_id || null),
      gcalSyncEnabled: payload.data.gcal_sync_enabled,
      progress: payload.data.progress,
      // 完成时间统一走 nextCompletedAtForUpdate：显式传值、重复约定打卡、普通完成自动打时间戳
      completedAt: nextCompletedAtForUpdate,
      deletedAt: payload.data.deleted_at === undefined ? undefined : (payload.data.deleted_at ? new Date(payload.data.deleted_at) : null),
      pinnedAt: payload.data.pinned_at === undefined ? undefined : (payload.data.pinned_at ? new Date(payload.data.pinned_at) : null),
      tags: payload.data.tags,
      reminderStrategy: payload.data.reminder_strategy,
      metadata: nextMetadata
    }
  });

  const nextChangeType = payload.data.deleted_at
    ? (task.parentTaskId ? "subtask_deleted" : "deleted")
    : payload.data.status
      ? (task.parentTaskId ? "subtask_status_changed" : "status_changed")
      : (task.parentTaskId ? "subtask_updated" : "updated");

  await createTaskChangeLog(
    req.user.id,
    task,
    nextChangeType,
    payload.data,
    {
      title: existing.title,
      description: existing.description,
      status: serializeTask(existing).status,
      priority: existing.priority,
      category: existing.category,
      due_at: existing.dueAt?.toISOString?.() || null,
      reminder_time: existing.reminderTime?.toISOString?.() || null,
      end_time: existing.endTime?.toISOString?.() || null,
      completed_at: existing.completedAt?.toISOString?.() || null,
      deleted_at: existing.deletedAt?.toISOString?.() || null,
      progress: existing.progress
    }
  );

  // 子约定的完成度进入父约定进度条：状态变更/删除/换父都会改变父约定的完成比；
  // 换父时旧父约定也要重算（被摘走子约定后其完成比同样变化）。小程序等未自行回算进度的客户端由此兜底。
  if (payload.data.status !== undefined || payload.data.deleted_at !== undefined || payload.data.parent_task_id !== undefined) {
    await syncParentProgress(task.parentTaskId);
    if (existing.parentTaskId && existing.parentTaskId !== task.parentTaskId) {
      await syncParentProgress(existing.parentTaskId);
    }
  }

  // 标题/描述变更后重新检测可自动执行的部分（maybeAutoExecute 内部有去重）
  if (payload.data.title !== undefined || payload.data.description !== undefined) {
    void maybeAutoExecute(task, req.user.id, prisma);
  }

  // 共有约定：状态/内容等关键变更通知其他参与方（纯提醒稍后等不通知）
  const SIGNIFICANT_CHANGE_KEYS = ["status", "title", "description", "priority", "due_at", "completed_at", "deleted_at"];
  if (SIGNIFICANT_CHANGE_KEYS.some((key) => payload.data[key] !== undefined)) {
    await notifyTaskParties(task, req.user, describeTaskChange(req.user, task, payload.data));
  }

  // 约定直接勾掉完成时，关联的待验收/待批准/执行中的执行单一并自动验收归档，
  // 避免守护记录里残留「等你确认」的已完成约定
  if (task.status === "DONE" && existing.status !== "DONE") {
    try {
      const autoAccepted = await prisma.taskExecution.updateMany({
        where: {
          taskId: task.id,
          userId: req.user.id,
          executionStatus: { in: ["pending", "waiting_confirm", "executing", "waiting_acceptance", "failed"] }
        },
        data: {
          executionStatus: "completed",
          completedAt: new Date(),
          userFeedback: { auto_accepted: true, note: "约定已完成，自动验收" }
        }
      });
      if (autoAccepted.count > 0) {
        console.log(`[tasks] task=${task.id} 完成时自动验收执行单 ${autoAccepted.count} 条`);
      }
    } catch (err) {
      console.warn(`[tasks] task=${task.id} 自动验收执行单失败:`, err?.message || err);
    }
  }

  // 行为埋点：完成/删除 transitions（重复打卡约定的每日勾选由 checkin_created 口径承担，这里只记非打卡约定的完成）
  if (task.status === "DONE" && existing.status !== "DONE" && task.category !== "checkin") {
    logBehavior(req.user.id, "task_completed", { taskId: task.id, category: task.category, metadata: { top: !task.parentTaskId } });
  }
  if (payload.data.deleted_at) {
    logBehavior(req.user.id, "task_deleted", { taskId: task.id, category: task.category });
  }

  return res.json(serializeTask(task));
});

tasksRouter.delete("/:id", async (req, res) => {
  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;
  if (access.role !== "owner") {
    return res.status(403).json({ error: "FORBIDDEN", message: "共有约定需创建者删除，你可以选择退出共有" });
  }
  const existing = access.task;

  await notifyTaskParties(existing, req.user, {
    type: "shared_task_deleted",
    title: "共有约定已删除",
    body: `${req.user.displayName || req.user.email || "对方"} 删除了共有约定「${existing.title}」`
  });

  await prisma.task.delete({ where: { id: existing.id } });
  logBehavior(req.user.id, "task_deleted", { taskId: existing.id, category: existing.category, metadata: { hard: true } });
  await syncParentProgress(existing.parentTaskId);
  await createTaskChangeLog(
    req.user.id,
    existing,
    existing.parentTaskId ? "subtask_deleted" : "deleted",
    { deleted_at: new Date().toISOString() },
    {
      title: existing.title,
      description: existing.description,
      status: serializeTask(existing).status,
      priority: existing.priority,
      category: existing.category
    }
  );
  return res.status(204).send();
});

// GET /api/tasks/:id/members - 共有成员列表（创建者/成员可见）
tasksRouter.get("/:id/members", async (req, res) => {
  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;

  const members = await prisma.taskMember.findMany({
    where: { taskId: access.task.id },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });

  const serializeMember = (user, joinedAt, isOwner) => ({
    user_id: user.id,
    display_name: user.displayName || user.email || user.phone || "用户",
    email: user.email || null,
    is_owner: isOwner,
    is_self: user.id === req.user.id,
    joined_at: joinedAt || null
  });

  return res.json({
    task_id: access.task.id,
    my_role: access.role,
    owner: serializeMember(access.task.user, access.task.createdAt, true),
    members: members.map((m) => serializeMember(m.user, m.createdAt, false))
  });
});

// DELETE /api/tasks/:id/members/:userId - 创建者移除成员；成员移除自己=退出共有
tasksRouter.delete("/:id/members/:userId", async (req, res) => {
  const access = await assertTaskAccess(req, res, req.params.id);
  if (!access) return;

  const targetUserId = req.params.userId;
  if (targetUserId === access.task.userId) {
    return res.status(400).json({ error: "INVALID_TARGET", message: "创建者不在成员列表中" });
  }

  const isSelfLeave = targetUserId === req.user.id;
  if (!isSelfLeave && access.role !== "owner") {
    return res.status(403).json({ error: "FORBIDDEN", message: "仅创建者可移除成员" });
  }

  const membership = await prisma.taskMember.findUnique({
    where: { taskId_userId: { taskId: access.task.id, userId: targetUserId } }
  });
  if (!membership) {
    return res.status(404).json({ error: "NOT_FOUND", message: "成员不存在" });
  }

  await prisma.taskMember.delete({ where: { id: membership.id } });

  const taskTitle = access.task.title;
  if (isSelfLeave) {
    await notifyTaskParties(access.task, req.user, {
      type: "shared_task_left",
      title: "有成员退出共有约定",
      body: `${req.user.displayName || req.user.email || "对方"} 退出了共有约定「${taskTitle}」`
    });
  } else {
    try {
      await prisma.notification.create({
        data: {
          userId: targetUserId,
          title: "你已被移出共有约定",
          body: `创建者将你移出了共有约定「${taskTitle}」`,
          channel: "in_app",
          status: "SENT",
          payload: { type: "shared_task_removed", taskId: access.task.id }
        }
      });
    } catch (error) {
      console.error("[tasks] notify removed member failed:", error);
    }
  }

  return res.json({ removed: true, user_id: targetUserId });
});
