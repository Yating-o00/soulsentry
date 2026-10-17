import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * 约定打卡（Checkin）：同一个约定可多次打卡，每次可附带一句话或照片。
 * 打卡是"履约记录"，与"盖章完成"语义独立：打卡不完成约定，完成约定也不删打卡。
 */
export const checkinsRouter = Router();

checkinsRouter.use(requireAuth);

const createSchema = z.object({
  note: z.string().trim().max(500).optional(),
  photo_url: z.string().trim().max(500).optional(),
  source: z.string().trim().max(40).optional(),
}).passthrough();

const patchSchema = z.object({
  note: z.string().trim().max(500).optional(),
  photo_url: z.string().trim().max(500).optional(),
}).passthrough();

function serializeCheckin(c) {
  return {
    id: c.id,
    task_id: c.taskId,
    note: c.note,
    photo_url: c.photoUrl,
    source: c.source,
    created_at: c.createdAt?.toISOString?.() || null,
  };
}

// 约定归属校验：创建者或共有成员可打卡
async function assertCheckinAccess(userId, taskId) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      OR: [{ userId }, { members: { some: { userId } } }],
    },
  });
  return task || null;
}

checkinsRouter.post("/:id/checkins", async (req, res) => {
  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const task = await assertCheckinAccess(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ error: "NOT_FOUND", message: "约定不存在或无权限" });

  const checkin = await prisma.checkin.create({
    data: {
      userId: req.user.id,
      taskId: task.id,
      note: parsed.data.note || null,
      photoUrl: parsed.data.photo_url || null,
      source: parsed.data.source || "manual",
    },
  });

  const total = await prisma.checkin.count({ where: { taskId: task.id } });
  const first = await prisma.checkin.findFirst({
    where: { taskId: task.id },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  // 行为日志：驱动"全设备智能协同"等个性化分析
  try {
    await prisma.userBehavior.create({
      data: {
        userId: req.user.id,
        eventType: "checkin_created",
        taskId: task.id,
        hourOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        category: task.category,
        metadata: { total, has_note: !!parsed.data.note, has_photo: !!parsed.data.photo_url },
      },
    });
  } catch (e) {
    console.warn("[checkins] behavior log failed:", e?.message || e);
  }

  return res.status(201).json({
    ...serializeCheckin(checkin),
    total,
    first_at: first?.createdAt?.toISOString?.() || null,
  });
});

checkinsRouter.get("/:id/checkins", async (req, res) => {
  const task = await assertCheckinAccess(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ error: "NOT_FOUND", message: "约定不存在或无权限" });

  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const [items, total, first] = await Promise.all([
    prisma.checkin.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.checkin.count({ where: { taskId: task.id } }),
    prisma.checkin.findFirst({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  return res.json({
    total,
    first_at: first?.createdAt?.toISOString?.() || null,
    items: items.map(serializeCheckin),
  });
});

// 补记：打卡后给当次记录附加想法/照片（点完打卡再写也行）
checkinsRouter.patch("/:id/checkins/:checkinId", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const task = await assertCheckinAccess(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ error: "NOT_FOUND", message: "约定不存在或无权限" });

  const existing = await prisma.checkin.findFirst({
    where: { id: req.params.checkinId, taskId: task.id },
  });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND", message: "打卡记录不存在" });

  const checkin = await prisma.checkin.update({
    where: { id: existing.id },
    data: {
      note: parsed.data.note !== undefined ? parsed.data.note : existing.note,
      photoUrl: parsed.data.photo_url !== undefined ? parsed.data.photo_url : existing.photoUrl,
    },
  });

  return res.json(serializeCheckin(checkin));
});
