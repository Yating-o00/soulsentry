import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setImmediate as flush } from "node:timers/promises";
import { test } from "node:test";
import {
  admitConversationLatency, beginLatencyStage, captureConversationLatency, markConversationLatency,
  mergePhaseIntervals, timeLatencyStage, withConversationLatency, withoutConversationLatency,
} from "./conversationLatency.js";
import { conversationLatencyScope, summarizeConversationLatency } from "./conversationLatencyStats.js";
import { embedMemoryText } from "./memoryEmbeddings.js";

const start = new Date("2026-11-26T01:00:00Z");

test("a disconnected response captures partial stages once with the ingress and total wall time", async () => {
  let time = 100;
  const rows = [];
  const req = {};
  const res = new EventEmitter();
  res.statusCode = 200;
  res.writableFinished = false;
  captureConversationLatency((row) => rows.push(row), { clock: () => time, wallClock: () => Number(start) })(req, res, () => {});
  time = 115;
  let finish;
  await withConversationLatency(async () => {
    admitConversationLatency("companion", "chat");
    await timeLatencyStage("context", async () => { time = 125; });
    assert.throws(() => timeLatencyStage("validation", () => { throw new Error("private assertion"); }), /private assertion/);
    finish = beginLatencyStage("model_attempt", "deepseek");
    markConversationLatency({ path: "schedule" });
  })(req, res);
  time = 150;
  res.emit("close");
  time = 175;
  finish();
  res.emit("finish");
  assert.equal(rows.length, 0);
  await flush();
  assert.equal(rows.length, 1);
  const [trace] = rows;
  assert.equal(trace.outcome, "interrupted");
  assert.equal(trace.httpStatus, null);
  assert.equal(trace.startedAt.toISOString(), start.toISOString());
  assert.equal(trace.path, "schedule");
  assert.equal(trace.totalMs, 50);
  assert.equal(trace.modelCalls, 1);
  assert.deepEqual(trace.phaseMs, { ingress: 15, context: 10, validation: 0, model_attempt: 25 });
  assert.deepEqual(trace.spans.at(-1), { phase: "model_attempt", detail: "deepseek", startMs: 25, durationMs: 25, status: "interrupted" });
  assert.equal(trace.spans[2].status, "error");
  assert.doesNotMatch(JSON.stringify(trace), /private assertion/);
});

test("an admitted request preserves the close time when the client disconnects before authentication finishes", async () => {
  let time = 100;
  const rows = [];
  const req = {};
  const res = new EventEmitter();
  captureConversationLatency((row) => rows.push(row), { clock: () => time })(req, res, () => {});
  time = 105;
  res.emit("close");
  time = 200;
  withConversationLatency(() => {
    admitConversationLatency("task_harness", "confirm");
    assert.equal(beginLatencyStage("capability"), undefined);
  })(req, res);
  await flush();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, "interrupted");
  assert.equal(rows[0].totalMs, 5);
  assert.deepEqual(rows[0].spans, [{ phase: "ingress", startMs: 0, durationMs: 5, status: "interrupted" }]);
});

test("attributes embedding calls across awaits and keeps detached work outside the response trace", async (t) => {
  for (const [key, value] of Object.entries({
    MEMORY_HYBRID_ENABLED: "1", MEMORY_EMBEDDING_URL: "https://fixture.invalid/embeddings", MEMORY_EMBEDDING_MODEL: "fixture-model",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const req = {};
  const rows = [];
  const res = new EventEmitter();
  res.statusCode = 200;
  captureConversationLatency((row) => rows.push(row))(req, res, () => {});
  await withConversationLatency(async () => {
    admitConversationLatency("companion", "chat");
    await timeLatencyStage("memory", async () => {
      await flush();
      return embedMemoryText("private memory", { fetchImpl: async () => Response.json({ data: [{ embedding: [3, 4] }] }) });
    });
    await timeLatencyStage("capability", () => withoutConversationLatency(async () => {
      await flush();
      assert.equal(beginLatencyStage("model_attempt"), undefined);
    }));
    res.emit("finish");
  })(req, res);
  await flush();
  assert.equal(rows[0].modelCalls, 1);
  assert.deepEqual(rows[0].modelCallsByPhase, { memory: 1 });
  assert.ok(rows[0].spans.some(({ detail, modelStage }) => detail === "memory_embedding" && modelStage === "memory"));
  assert.doesNotMatch(JSON.stringify(rows[0]), /private memory|fixture-model|fixture.invalid/);
});

test("repeated intervals merge per phase and per turn while failed responses remain in the latency distribution", () => {
  const phaseMs = mergePhaseIntervals([
    { phase: "memory", startMs: 400, durationMs: 400 },
    { phase: "memory", startMs: 200, durationMs: 400 },
    { phase: "planner_model", startMs: 800, durationMs: 1000 },
    { phase: "planner_model", startMs: 2000, durationMs: 600 },
  ]);
  assert.deepEqual(phaseMs, { memory: 600, planner_model: 1600 });
  const row = { startedAt: start, entry: "companion", path: "schedule", totalMs: 3000, phaseMs, modelCalls: 3, modelCallsByPhase: { planner_model: 2 } };
  const stats = summarizeConversationLatency([
    { ...row, outcome: "proposal" },
    { ...row, outcome: "fallback", totalMs: 20000, phaseMs: { memory: 100 }, modelCalls: 1, modelCallsByPhase: { memory: 1 } },
    { ...row, outcome: "interrupted", totalMs: 30000 },
  ], { from: "2026-11-25", to: "2026-11-26" });
  assert.deepEqual(stats.total, { count: 2, p50: 3000, p95: 20000 });
  assert.deepEqual(stats.interrupted, { count: 1, p50: 30000, p95: 30000 });
  assert.deepEqual(stats.stages, [
    { phase: "memory", count: 2, p50: 100, p95: 600, modelCalls: 1 },
    { phase: "planner_model", count: 1, p50: 1600, p95: 1600, modelCalls: 2 },
  ]);
  assert.deepEqual(stats.daily.map(({ count }) => count), [0, 2]);
  assert.equal(stats.modelCalls, 7);
});

test("calendar filters use Beijing days and clamp the lower bound to the rolling retention cutoff", () => {
  const scope = conversationLatencyScope({ days: "30", from: "2026-10-01", to: "2026-11-01" }, Number(start));
  assert.equal(scope.where.startedAt.gte.toISOString(), "2026-10-27T01:00:00.000Z");
  assert.equal(scope.where.startedAt.lt.toISOString(), "2026-11-01T16:00:00.000Z");
  assert.equal(conversationLatencyScope({}, Number(start)).range.from, "2026-11-20");
  assert.equal(conversationLatencyScope({ from: "2026-11-31" }, Number(start)), null);
  assert.equal(conversationLatencyScope({ entry: ["companion", "task_harness"] }, Number(start)), null);
});
