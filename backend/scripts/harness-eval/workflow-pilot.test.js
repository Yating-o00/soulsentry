import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { defineCapability } from "../../src/services/agentHarness/capability.js";
import { createTaskWorkflow } from "../../src/services/agentHarness/runTaskWorkflow.js";
import { generalCases } from "./general-cases.js";
import { runGeneralCase } from "./general-runner.js";
import { pilotReadCapabilities } from "./read-pilot.js";
import { createWorkflowPilotDriver, memoryStore } from "./workflow-pilot.js";

function writes({ description, input }, callTool) {
  return defineCapability({
    name: "set_status", description, modelInput: input, effect: "write",
    input: z.object({ id: z.string(), status: z.enum(["open", "paused", "done"]), version: z.number().int() }).strict(),
    prepare(args, { evidence }) {
      const record = evidence.find((item) => item.id === args.id && item.version === args.version);
      if (!record) throw Object.assign(new Error("Record version is absent from evidence"), { code: "precondition_changed" });
      return { title: record.title };
    },
    async execute(args, { operationId }) {
      const result = await callTool("set_status", args, operationId);
      if (!result.ok) throw Object.assign(new Error(result.code), { code: result.code });
    },
    async verify(_args, { operationId }) {
      const result = await callTool("lookup_action", { operationId });
      return result.ok && result.data.committed ? result.data : null;
    },
  });
}

function decide({ input, continuation, observations }) {
  if (!observations.length) return { type: "call", tool: "find_records", args: { query: "周报" } };
  const source = observations[0];
  const records = source.result.data;
  const record = records.find(({ title }) => title === (/周报 B/.test(input) ? "周报 B" : "周报 A"));
  if (input.includes("那条") && !continuation) {
    return { type: "ask", question: "是周报 A 还是周报 B？", choices: records.map(({ id }) => id) };
  }
  if (input.includes("展示格式")) {
    if (observations.length === 1) return { type: "call", tool: "find_collections", args: { id: record.collectionId } };
    return { type: "finish", reply: `在${observations[1].result.data[0].name}。`, facts: [{ id: record.id, collectionId: record.collectionId }], evidenceIds: observations.map(({ id }) => id) };
  }
  if (input.includes("是否已完成")) {
    return { type: "finish", reply: "周报 A 还开着。", facts: [{ id: record.id, status: record.status }], evidenceIds: [source.id] };
  }
  return { type: "propose", tool: "set_status", args: { id: record.id, version: record.version, status: input.includes("暂缓") ? "paused" : "done" }, evidenceIds: [source.id] };
}

const driver = createWorkflowPilotDriver({ decide, writeAdapters: new Map([["set_status", writes]]) });

for (const fixture of generalCases.filter(({ holdout }) => !holdout)) {
  test(`M3 passes the independent grader through the workflow: ${fixture.id}`, async () => {
    const report = await runGeneralCase(fixture, driver);
    assert.deepEqual(report.issues, []);
  });
}

test("an expired claim from a crashed process verifies its receipt without restarting a write", async () => {
  const store = memoryStore();
  const task = await store.create({ id: "task", actorId: "owner", data: {
    status: "applying", claimedAt: 1000,
    proposal: { id: "task", version: 1, actions: [{ capability: "set_status", args: { id: "a", version: 1, status: "done" } }] },
  } });
  const cap = writes({ description: "write", input: {} }, async (name, args) => {
    assert.equal(name, "lookup_action");
    assert.equal(args.operationId, "harness:task:1");
    return { ok: true, data: { operationId: args.operationId, committed: true } };
  });
  const resumed = createTaskWorkflow({ store, capabilities: [cap], now: () => 20_000 });
  const result = await resumed({ type: "confirm", actorId: task.userId, taskId: task.id, proposal: { id: task.id, version: 1 } });
  assert.equal(result.status, "completed");
  assert.equal((await store.get(task.id, task.userId)).data.status, "completed");
});

test("a receipt for a different operation cannot verify a pending write", async () => {
  const store = memoryStore();
  await store.create({ id: "task", actorId: "owner", data: {
    status: "applying", claimedAt: 1000,
    proposal: { id: "task", version: 1, actions: [{ capability: "set_status", args: { id: "a", version: 1, status: "done" } }] },
  } });
  const capability = writes({ description: "write", input: {} }, async (name) => {
    assert.equal(name, "lookup_action");
    return { ok: true, data: { operationId: "an-unrelated-operation", committed: true } };
  });
  const result = await createTaskWorkflow({ store, capabilities: [capability], now: () => 20_000 })({
    type: "confirm", actorId: "owner", taskId: "task", proposal: { id: "task", version: 1 },
  });
  assert.equal(result.status, "unverified");
  assert.equal(result.receipt, undefined);
});

test("an old confirmation sent while a revision is being planned cannot apply", async () => {
  const fixture = generalCases.find(({ id }) => id === "superseded_proposal");
  const makeDriver = ({ capabilities }) => {
    const store = memoryStore();
    return async (input, { callTool }) => {
      const make = (decideNext) => createTaskWorkflow({ store,
        capabilities: [...pilotReadCapabilities(capabilities, input.actorId, callTool), writes(capabilities.find(({ name }) => name === "set_status"), callTool)], decide: decideNext,
      });
      if (input.type !== "reply") return make(decide)(input);
      return make(async (turn) => {
        if (!turn.observations.length) {
          const stale = await make(decide)({ ...input, type: "confirm", proposal: { id: input.taskId, version: 1 } });
          assert.equal(stale.code, "stale_proposal");
        }
        return decide(turn);
      })(input);
    };
  };
  const report = await runGeneralCase(fixture, makeDriver);
  assert.deepEqual(report.issues, []);
});
