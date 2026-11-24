import { z } from "zod";
import { defineCapability } from "../../src/services/agentHarness/capability.js";
import { createTaskHarnessDecider } from "../../src/services/agentHarness/readHarnessDecider.js";
import { createWorkflowPilotDriver } from "./workflow-pilot.js";

const id = z.string().min(1);
const version = z.number().int().positive();
const input = z.object({
  records: z.array(z.object({ id, version }).strict()).min(1)
    .refine((records) => new Set(records.map((record) => record.id)).size === records.length),
  target: id,
  targetVersion: version,
}).strict();

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

function inspect(args, evidence) {
  const destination = evidence.find((item) => item.id === args.target && item.version === args.targetVersion
    && Number.isInteger(item.capacity) && Number.isInteger(item.occupied));
  const records = args.records.map(({ id, version }) => evidence.find((item) => item.id === id && item.version === version
    && typeof item.collectionId === "string"));
  if (!destination || records.some((item) => !item)) reject("precondition_changed");
  const incoming = records.filter(({ collectionId }) => collectionId !== args.target).length;
  if (destination.occupied + incoming > destination.capacity) reject("precondition_changed");
  return { target: destination.name, titles: records.map(({ title }) => title) };
}

export function bulkMoveCapability(registration, callTool) {
  return defineCapability({
    name: registration.name,
    description: `${registration.description} 出提案前分别读取来源记录及目标集合，引用包含它们的证据。`,
    effect: "write",
    modelInput: registration.input,
    input,
    prepare(args, { evidence }) {
      return inspect(args, evidence);
    },
    async execute(args, { operationId, signal }) {
      const [destination, records] = await Promise.all([
        callTool("find_collections", { id: args.target }),
        callTool("find_records", {}),
      ]);
      if (!destination.ok || !records.ok) reject(destination.code ?? records.code);
      inspect(args, [...destination.data, ...records.data]);
      signal?.throwIfAborted();
      // The tool checks the same preconditions atomically with the batch write.
      const result = await callTool("move_records", args, operationId);
      if (!result.ok) reject(result.code);
    },
    async verify(args, { operationId }) {
      const receipt = await callTool("lookup_action", { operationId });
      if (!receipt.ok || !receipt.data.committed) return null;
      const target = await callTool("find_records", { collectionId: args.target });
      if (!target.ok || !args.records.every(({ id }) => target.data.some((entry) => entry.id === id))) return null;
      return receipt.data;
    },
  });
}

export function createBulkMovePilotDriver({ invoke, decide = createTaskHarnessDecider({ invoke }) } = {}) {
  return createWorkflowPilotDriver({ decide, writeAdapters: new Map([["move_records", bulkMoveCapability]]) });
}
