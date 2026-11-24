import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { defineCapability } from "./capability.js";
import { runReadHarness } from "./runReadHarness.js";

const modelInput = { type: "object", properties: { id: { type: "string" }, filter: { type: "string" } }, required: ["id"] };
const fixture = { id: "alice-record", owner: "alice", status: "open" };
const read = (name, execute, options = {}) => defineCapability({
  name, description: `Read ${name}`, effect: "read",
  input: z.object({ id: z.string(), filter: z.string().optional() }).strict(), modelInput, execute,
  ...options,
});
const call = (tool, args = { id: fixture.id }) => ({ type: "call", tool, args });
const finish = (evidenceIds = ["obs-1"], facts = [{ id: fixture.id, status: "open" }]) => ({
  type: "finish", reply: "周报还开着。", evidenceIds, facts,
});
const run = (decide, options = {}) => runReadHarness({ actorId: "alice", input: "查一下周报", decide, ...options });

test("follows observed results to a second read, and validates cited facts", async () => {
  const getReport = read("get_report", ({ id }, { actorId, signal }) => {
    assert.equal(actorId, "alice");
    assert.ok(signal instanceof AbortSignal);
    assert.equal(id, fixture.id);
    return [{ ...fixture, collectionId: "inbox" }];
  });
  const getCollection = read("get_collection", ({ id }) => ({ id, label: "收件箱" }));
  const outcome = await run(({ capabilities, observations }) => {
    assert.deepEqual(capabilities, [
      { name: "get_report", description: "Read get_report", input: modelInput },
      { name: "get_collection", description: "Read get_collection", input: modelInput },
    ]);
    if (observations.length === 0) return call("get_report");
    if (observations.length === 1) return call("get_collection", { id: observations[0].result.data[0].collectionId });
    return finish(["obs-1", "obs-2"], [
      { id: fixture.id, status: "open" },
      { id: "inbox", label: "收件箱" },
    ]);
  }, { capabilities: [getReport, getCollection], taskId: "existing-task" });
  assert.equal(outcome.status, "completed");
  assert.equal(outcome.taskId, "existing-task");
  assert.notEqual(outcome.runId, outcome.taskId);
  assert.deepEqual(outcome.evidenceIds, ["obs-1", "obs-2"]);
  assert.deepEqual(outcome.trace.map(({ type }) => type), ["call", "call", "finish"]);
  assert.equal(outcome.modelCalls, 3);
  assert.equal(outcome.toolCalls, 2);
});

test("returns a model-chosen question without further calls", async () => {
  let decisions = 0;
  const question = "你指的是哪条周报？";
  const outcome = await run(() => {
    decisions += 1;
    return { type: "ask", question };
  });
  assert.equal(outcome.status, "awaiting_input");
  assert.equal(outcome.question, question);
  assert.equal(outcome.choices, undefined);
  assert.equal(outcome.toolCalls, 0);
  assert.equal(decisions, 1);
});

test("only offers clarification choices from successful scoped reads", async () => {
  const capability = read("lookup", () => [{ id: "report-a" }, { id: "report-b" }]);
  const ask = (choices) => ({ type: "ask", question: "你指的是哪条周报？", choices });
  const valid = await run(({ observations }) => observations.length
    ? ask(["report-a", "report-b"]) : call("lookup"), { capabilities: [capability] });
  assert.equal(valid.status, "awaiting_input");
  assert.deepEqual(valid.choices, ["report-a", "report-b"]);
  const forged = await run(({ observations }) => observations.length
    ? ask(["report-a", "other-account-record"]) : call("lookup"), { capabilities: [capability] });
  assert.equal(forged.code, "MISSING_EVIDENCE");
  assert.equal(forged.choices, undefined);
});

test("hides write and server-only capabilities and does not invoke them", async () => {
  const neverRun = () => assert.fail("the runtime must not invoke this capability");
  const write = read("change_record", neverRun, { effect: "write" });
  const serverOnly = read("server_read", neverRun, { modelInput: undefined });
  const outcome = await run(({ capabilities, observations }) => {
    assert.deepEqual(capabilities, []);
    if (observations.length === 0) return call("change_record");
    if (observations.length === 1) return call("server_read");
    return finish();
  }, { capabilities: [write, serverOnly] });
  assert.equal(outcome.code, "MISSING_EVIDENCE");
  assert.deepEqual(outcome.trace.map(({ code }) => code), ["UNKNOWN_TOOL", "UNKNOWN_TOOL"]);
  assert.equal(outcome.toolCalls, 0);
});

test("shares tool validation and authorization failures without invoking the tool", async () => {
  let executions = 0;
  const capability = read("lookup", () => {
    executions += 1;
    return fixture;
  }, { authorize: ({ id }, { actorId }) => id === `${actorId}-record` });
  const outcome = await run(({ observations }) => {
    if (observations.length === 0) return call("lookup", { id: 123 });
    if (observations.length === 1) return call("lookup", { id: "other-record" });
    if (observations.length === 2) return call("lookup");
    return finish(["obs-3"]);
  }, { capabilities: [capability] });
  assert.equal(outcome.status, "completed");
  assert.deepEqual(outcome.trace.slice(0, 2).map(({ code }) => code), ["INVALID_ARGUMENTS", "FORBIDDEN"]);
  assert.equal(executions, 1);
});

test("rejects a fabricated evidence ID and a fabricated fact inside valid evidence", async () => {
  const capability = read("lookup", () => [fixture]);
  const forged = [finish(["obs-6"]), finish(["obs-1"], [{ ...fixture, status: "done" }])];
  for (const decision of forged) {
    const outcome = await run(({ observations }) => {
      if (observations.length === 0) return call("lookup");
      observations[0].result.data[0].status = "done";
      return decision;
    }, { capabilities: [capability] });
    assert.equal(outcome.code, "MISSING_EVIDENCE");
  }
});

test("returns a bounded budget result after the configured model decisions", async () => {
  const capability = read("lookup", () => []);
  const outcome = await run(({ observations }) => call("lookup", { id: String(observations.length) }), {
    capabilities: [capability], maxSteps: 2,
  });
  assert.equal(outcome.code, "BUDGET_EXHAUSTED");
  assert.equal(outcome.trace.length, 2);
});

test("stops a repeated call even if the argument key order changes", async () => {
  const capability = read("lookup", () => [fixture]);
  const outcome = await run(({ observations }) => call("lookup", observations.length
    ? { filter: "all", id: fixture.id } : { id: fixture.id, filter: "all" }), { capabilities: [capability] });
  assert.equal(outcome.code, "NO_PROGRESS");
  assert.equal(outcome.trace.length, 1);
});

test("returns controlled outcomes for provider failures and malformed decisions", async () => {
  const failed = await run(() => { throw new Error("provider details"); });
  assert.equal(failed.code, "MODEL_FAILURE");
  assert.equal(JSON.stringify(failed).includes("provider details"), false);
  const malformed = await run(() => ({ type: "finish", reply: "unverified" }));
  assert.equal(malformed.code, "INVALID_DECISION");
});

test("stops when cancelled during a provider call that does not settle", async () => {
  const controller = new AbortController();
  const outcome = await run(({ signal }) => {
    setImmediate(() => controller.abort());
    assert.ok(signal instanceof AbortSignal);
    return new Promise(() => {});
  }, { signal: controller.signal });
  assert.equal(outcome.code, "RUN_ABORTED");
});
