import { timeLatencyStage } from "../conversationLatency.js";

// Keep private continuation data separate from companion chat and memory retrieval.
const json = (value) => JSON.parse(JSON.stringify(value));

export function createTaskWorkflowStore(db) {
  return {
    create({ id, actorId, data }) {
      return timeLatencyStage("persistence", () => db.harnessTask.create({ data: { id, userId: actorId, data: json(data) } }), "task_create");
    },
    get(id, actorId) {
      if (!id) return null;
      return timeLatencyStage("context", () => db.harnessTask.findFirst({ where: { id, userId: actorId } }), "task_load");
    },
    async replace(task, data) {
      const next = json(data);
      const result = await timeLatencyStage("persistence", () => db.harnessTask.updateMany({
        where: { id: task.id, userId: task.userId, revision: task.revision },
        data: { data: next, revision: { increment: 1 } },
      }), "task_update");
      return result.count === 1 ? { ...task, data: next, revision: task.revision + 1 } : null;
    },
  };
}
