import { createHash } from "node:crypto";
import { z } from "zod";
import { defineCapability } from "./capability.js";

const id = z.string().min(1).max(128);
const states = ["TODO", "DONE"];
const text = { type: "string" };
const select = { id: true, title: true, status: true, updatedAt: true, category: true, metadata: true };
const hasActor = (_args, { actorId }) => typeof actorId === "string" && Boolean(actorId);
const scope = (userId) => ({ userId, deletedAt: null, parentTaskId: null, status: { not: "ARCHIVED" } });
const supported = (task) => task && task.category !== "checkin" && !task.metadata?.repeat_rule;
const versionOf = ({ id, title, status, updatedAt }) => createHash("sha256").update(JSON.stringify([id, title, status, updatedAt])).digest("hex");
const publicRecord = (task) => ({ id: task.id, title: task.title, status: task.status, version: versionOf(task) });
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export function ownedTaskCapabilities(db) {
  const findTasks = defineCapability({
    name: "find_tasks", effect: "read", description: "按标题片段或 ID 查找本人的普通约定。返回状态和版本。",
    input: z.object({ query: z.string().trim().min(1).max(100).optional(), id: id.optional() }).strict(),
    modelInput: { type: "object", properties: { query: text, id: text }, additionalProperties: false },
    authorize: hasActor,
    async execute({ query, id }, { actorId }) {
      const records = await db.task.findMany({
        where: { ...scope(actorId), ...(id ? { id } : {}), ...(query ? { title: { contains: query } } : {}) },
        select, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 25,
      });
      return records.filter(supported).map(publicRecord);
    },
  });
  const setStatus = defineCapability({
    name: "set_task_status", effect: "write", description: "将本人一条普通约定标为完成 (DONE) 或重新打开 (TODO)。使用查询结果里的 ID 和版本。",
    input: z.object({ id, version: z.string().regex(/^[0-9a-f]{64}$/), status: z.enum(states) }).strict(),
    modelInput: { type: "object", properties: { id: text, version: text, status: { enum: states } }, required: ["id", "version", "status"], additionalProperties: false },
    authorize: hasActor,
    prepare(args, { evidence }) {
      const record = evidence.find((item) => item?.id === args.id && item.version === args.version);
      if (!record) reject("precondition_changed");
      return { title: record.title, from: record.status, to: args.status };
    },
    async execute(args, { actorId, operationId, signal }) {
      await db.$transaction(async (tx) => {
        const prior = await tx.taskChangeLog.findFirst({ where: { id: operationId, userId: actorId, taskId: args.id, changeType: "harness_status" } });
        if (prior) return;
        const where = { ...scope(actorId), id: args.id };
        const current = await tx.task.findFirst({ where, select });
        if (!supported(current)) reject("forbidden");
        if (versionOf(current) !== args.version) reject("precondition_changed");
        signal?.throwIfAborted();
        const changed = await tx.task.updateMany({
          where: { ...where, updatedAt: current.updatedAt, title: current.title, status: current.status },
          data: { status: args.status, completedAt: args.status === "DONE" ? current.status === "DONE" ? undefined : new Date() : null },
        });
        if (changed.count !== 1) reject("precondition_changed");
        await tx.taskChangeLog.create({ data: {
          id: operationId, userId: actorId, taskId: args.id, taskTitle: current.title, changeType: "harness_status",
          changedFields: ["status"], changesDetail: [{ field: "status", field_label: "状态", old_value: current.status, new_value: args.status }],
        } });
      });
    },
    async verify(args, { actorId, operationId }) {
      const [record, receipt] = await Promise.all([
        db.task.findFirst({ where: { ...scope(actorId), id: args.id }, select }),
        db.taskChangeLog.findFirst({ where: { id: operationId, userId: actorId, taskId: args.id, changeType: "harness_status" } }),
      ]);
      return receipt && record?.status === args.status ? { operationId, record: publicRecord(record) } : null;
    },
  });
  return [findTasks, setStatus];
}
