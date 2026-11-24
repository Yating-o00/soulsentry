import { createTaskWorkflow } from "../../src/services/agentHarness/runTaskWorkflow.js";
import { pilotReadCapabilities } from "./read-pilot.js";

export function memoryStore() {
  const rows = new Map();
  return {
    async create({ id, actorId, data }) {
      const row = { id, userId: actorId, revision: 0, data };
      rows.set(id, row);
      return structuredClone(row);
    },
    async get(id, actorId) {
      const row = rows.get(id);
      return row?.userId === actorId ? structuredClone(row) : null;
    },
    async replace(row, data) {
      const previous = rows.get(row.id);
      if (previous?.userId !== row.userId || previous?.revision !== row.revision) return null;
      const next = { ...row, revision: row.revision + 1, data };
      rows.set(row.id, next);
      return structuredClone(next);
    },
  };
}

export function createWorkflowPilotDriver({ decide, writeAdapters }) {
  return ({ capabilities }) => {
    const store = memoryStore();
    return (input, { callTool }) => createTaskWorkflow({
      store,
      capabilities: [
        ...pilotReadCapabilities(capabilities, input.actorId, callTool),
        ...capabilities.filter(({ name, effect }) => effect === "write" && writeAdapters.has(name))
          .map((capability) => writeAdapters.get(capability.name)(capability, callTool)),
      ],
      decide,
    })(input);
  };
}
