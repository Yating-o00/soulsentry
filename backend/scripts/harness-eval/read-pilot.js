import { z } from "zod";
import { defineCapability } from "../../src/services/agentHarness/capability.js";
import { createReadHarnessDecider } from "../../src/services/agentHarness/readHarnessDecider.js";
import { runReadHarness } from "../../src/services/agentHarness/runReadHarness.js";

const pilotInputs = new Map([
  ["find_records", z.object({ query: z.string().optional(), collectionId: z.string().optional() }).strict()],
  ["find_collections", z.object({ query: z.string().optional(), id: z.string().optional() }).strict()],
]);

export function createReadPilotDriver({ invoke, maxSteps, signal } = {}) {
  const decide = createReadHarnessDecider({ invoke });
  return ({ capabilities }) => async ({ actorId, taskId, text }, { callTool }) => {
    const reads = pilotReadCapabilities(capabilities, actorId, callTool);
    return runReadHarness({ actorId, taskId, input: text, capabilities: reads, decide, maxSteps, signal });
  };
}

export function pilotReadCapabilities(capabilities, actorId, callTool) {
  // The benchmark binds callTool to the authenticated actor on each invocation.
  return capabilities.filter(({ name, effect }) => effect === "read" && pilotInputs.has(name))
    .map(({ name, description, input }) => defineCapability({
      name, description, effect: "read", input: pilotInputs.get(name), modelInput: input,
      authorize: (_args, context) => context.actorId === actorId,
      execute: async (args) => {
        const result = await callTool(name, args);
        if (result.ok) return result.data;
        const code = result.code === "forbidden" ? "FORBIDDEN" : "READ_FAILED";
        throw Object.assign(new Error(code), { code });
      },
    }));
}
