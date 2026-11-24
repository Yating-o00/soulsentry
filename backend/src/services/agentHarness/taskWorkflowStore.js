// Keep private continuation data separate from companion chat and memory retrieval.
const json = (value) => JSON.parse(JSON.stringify(value));

export function createTaskWorkflowStore(db) {
  return {
    create({ id, actorId, data }) {
      return db.harnessTask.create({ data: { id, userId: actorId, data: json(data) } });
    },
    get(id, actorId) {
      if (!id) return null;
      return db.harnessTask.findFirst({ where: { id, userId: actorId } });
    },
    async replace(task, data) {
      const next = json(data);
      const result = await db.harnessTask.updateMany({
        where: { id: task.id, userId: task.userId, revision: task.revision },
        data: { data: next, revision: { increment: 1 } },
      });
      return result.count === 1 ? { ...task, data: next, revision: task.revision + 1 } : null;
    },
  };
}
