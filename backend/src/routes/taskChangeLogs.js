import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const taskChangeLogsRouter = Router();

taskChangeLogsRouter.use(requireAuth);

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

function serializeChangeLog(item) {
  return {
    id: item.id,
    task_id: item.taskId,
    parent_task_id: item.parentTaskId,
    change_type: item.changeType,
    task_title: item.taskTitle,
    changed_fields: item.changedFields || [],
    changes_detail: item.changesDetail || [],
    created_date: item.createdAt,
    updated_date: item.updatedAt
  };
}

taskChangeLogsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const where = { userId: req.user.id };
  if (req.query.task_id) where.taskId = String(req.query.task_id);
  if (req.query.parent_task_id) where.parentTaskId = String(req.query.parent_task_id);

  const logs = await prisma.taskChangeLog.findMany({
    where,
    orderBy: parseSort(req.query.sort),
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(logs.map(serializeChangeLog));
});
