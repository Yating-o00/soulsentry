import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { aiHttpContext, aiRequestContext, aiTrace, getAiContext, recordAiAttempt, runAiTaskContext } from "./aiContext.js";
import { callKimiChat } from "./kimi.js";
import { invokeDashboardAi } from "./dashboardAi.js";
import { runFlowChat } from "../services/flowChat.js";

function setup(t) {
  const names = ["KIMI_API_KEY", "MOONSHOT_API_KEY", "KIMI_FALLBACK_API_KEY", "MOONSHOT_FALLBACK_API_KEY", "DEEPSEEK_API_KEY", "CHAT_AI_PROVIDER", "CHAT_AI_EXPERIMENT_ENABLED"];
  const old = names.map(n => [n, process.env[n]]);
  t.after(() => old.forEach(([n, v]) => v === undefined ? delete process.env[n] : process.env[n] = v));
  names.forEach(n => delete process.env[n]);
  process.env.KIMI_API_KEY = "sk-secret-api-key";
  const events = [];
  t.mock.method(console, "info", (tag, line) => events.push({ tag, ...JSON.parse(line) }));
  const logs = [];
  t.mock.method(console, "log", (...parts) => logs.push(parts.join(" ")));
  return { events, logs };
}
const options = { messages: [{ role: "user", content: "PRIVATE_PROMPT" }], models: ["kimi-test"], singleAttempt: true, responseJsonSchema: true };
const jsonResponse = (content = '{"answer":"PRIVATE_REPLY"}') => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { "x-request-id": "upstream-123" } });
function http(work, { headers = {}, gate = true, body = undefined, status = 200, finish = true, request = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { get: n => headers[n], baseUrl: "/api/companion", route: { path: "/messages" }, path: "/messages?private=true", ...request };
    const res = new EventEmitter();
    Object.assign(res, { statusCode: status, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; if (finish) { this.writableFinished = true; this.emit("finish"); } resolve(this); return this; } });
    const run = () => Promise.resolve().then(work).then(value => res.json(body ?? value)).catch(reject);
    aiHttpContext(req, res, () => gate ? aiRequestContext(req, res, run) : run());
  });
}

for (const [label, status, payload, expected] of [
  ["balance", 429, { error: { code: "insufficient_balance", message: "PRIVATE_UPSTREAM insufficient balance" } }, "insufficient_balance"],
  ["rate limit", 429, { error: { code: "rate_limit_reached" } }, "rate_limited"],
  ["authentication", 401, { error: { code: "invalid_api_key" } }, "authentication_error"],
  ["upstream", 503, { error: { code: "overloaded" } }, "upstream_error"],
]) test(`${label} errors retain safe code and request ID, then DeepSeek takes over`, async t => {
  const { events, logs } = setup(t);
  process.env.DEEPSEEK_API_KEY = "sk-deepseek-secret";
  t.mock.method(globalThis, "fetch", async url => url.includes("deepseek") ? jsonResponse() : new Response(JSON.stringify(payload), { status, headers: { "x-request-id": "upstream-456" } }));
  const res = await http(async () => { await callKimiChat(options); return { source: "ai" }; });
  const completed = events.filter(e => e.tag === "[aiAttempt]" && e.event === "completed");
  assert.equal(completed[0].reason, expected);
  assert.equal(completed[0].status, status);
  assert.equal(completed[0].upstreamRequestId, "upstream-456");
  assert.equal(completed[0].errorCode, payload.error.code);
  assert.equal(completed[1].provider, "deepseek");
  assert.equal(completed[1].status, 200);
  assert.notEqual(completed[0].attemptId, completed[1].attemptId);
  assert.equal(events.find(e => e.event === "request_completed").businessSuccess, true);
  assert.equal(res.headers["X-Request-ID"], completed[0].requestId);
  assert.ok(events.every(e => e.deploymentId && e.requestId && e.timestamp && e.schemaVersion === 2));
  assert.doesNotMatch(JSON.stringify({ events, logs }), /PRIVATE_|sk-secret|sk-deepseek/);
});

for (const [content, expected] of [["", "empty_response"], ["not valid json PRIVATE_REPLY", "invalid_json"]]) {
  test(`${expected} is distinct from upstream success`, async t => {
    const { events } = setup(t);
    t.mock.method(globalThis, "fetch", async () => jsonResponse(content));
    const res = await http(async () => { await assert.rejects(callKimiChat(options)); return { degraded: true }; });
    assert.equal(res.body.ai.attempts[0].reason, expected);
    assert.equal(events.find(e => e.event === "request_completed").businessSuccess, false);
    assert.equal(res.body.ai.provider, null);
  });
}

test("timeouts and network errors use distinct categories", async t => {
  const { events } = setup(t);
  t.mock.method(globalThis, "fetch", async (_url, request) => new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(Object.assign(new Error("PRIVATE_REPLY"), { name: "AbortError" })), { once: true })));
  await http(async () => { await assert.rejects(callKimiChat({ ...options, fetchTimeout: 5 })); return { degraded: true }; });
  assert.equal(events.find(e => e.event === "completed").reason, "timeout");
  globalThis.fetch = async () => { throw new TypeError("fetch failed PRIVATE_PROMPT"); };
  await http(async () => { await assert.rejects(callKimiChat(options)); return { degraded: true }; });
  assert.equal(events.filter(e => e.event === "completed").at(-1).reason, "network_error");
});

test("successful preparatory call does not imply business success or override fallback", async t => {
  const { events } = setup(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  await http(async () => { await callKimiChat(options); return { degraded: true }; });
  const final = events.find(e => e.event === "request_completed");
  assert.equal(final.attempts[0].outcome, "success");
  assert.equal(final.businessSuccess, false);
  assert.equal(final.source, "fallback");
  assert.equal(final.provider, null);
});

test("HTTP 200 without business evidence remains unknown", async t => {
  const { events } = setup(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  await http(async () => { await callKimiChat(options); return { status: "received" }; });
  assert.equal(events.find(e => e.event === "request_completed").businessSuccess, null);
});

test("late attempt completion retains the timed out request's ID", async t => {
  const { events } = setup(t);
  let release;
  t.mock.method(globalThis, "fetch", () => new Promise(resolve => { release = () => resolve(jsonResponse()); }));
  let pending;
  const res = await http(() => { pending = callKimiChat(options); return { degraded: true }; });
  const before = events.find(e => e.event === "request_completed");
  assert.equal(before.attempts[0].outcome, "pending");
  release(); await pending;
  const completed = events.find(e => e.event === "completed");
  assert.equal(completed.late, true);
  assert.equal(completed.requestId, res.body.ai.requestId);
  assert.equal(completed.attemptId, before.attempts[0].attemptId);
  assert.equal(before.businessSuccess, false);
});

test("parallel requests do not mix IDs and unsafe frontend/path values are excluded", async t => {
  const { events } = setup(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  const responses = await Promise.all([1, 2].map(() => http(async () => { await callKimiChat(options); return { source: "ai" }; }, { headers: { "X-Frontend-Deployment-ID": "prod-20261125", "X-Frontend-Commit-SHA": "a".repeat(40), "X-Frontend-Built-At": "2026-11-25T12:00:00Z" } })));
  assert.notEqual(responses[0].body.ai.requestId, responses[1].body.ai.requestId);
  for (const res of responses) assert.equal(res.body.ai.attempts.length, 1);
  assert.equal(events[0].frontendVersion.deploymentId, "prod-20261125");
  assert.ok(events.every(e => e.route === "/api/companion/messages"));
  const unsafe = await http(async () => { await callKimiChat(options); return { source: "ai" }; }, { headers: { "X-Frontend-Deployment-ID": "PRIVATE_PROMPT/?key=secret", "X-Frontend-Commit-SHA": "secret" } });
  assert.equal(unsafe.body.ai.frontendVersion, null);
  assert.equal(getAiContext(), undefined);
});

test("global context covers nonlegacy endpoints quietly and detects client disconnects", async t => {
  const { events } = setup(t);
  await http(() => ({ ok: true }), { gate: false });
  assert.equal(events.length, 0);
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  const res = await http(async () => { await callKimiChat(options); return { source: "ai" }; }, { gate: false, finish: false });
  res.emit("close");
  assert.equal(events.filter(e => e.event === "request_completed").length, 1);
  assert.equal(events.at(-1).businessSuccess, false);
  assert.equal(events.at(-1).disconnected, true);
});

test("background boundaries associate multiple child calls and never claim business success", async t => {
  const { events } = setup(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  await runAiTaskContext("memory.extract", async () => { await callKimiChat(options); await invokeDashboardAi({ prompt: "private", models: ["kimi-test"] }); });
  const final = events.find(e => e.event === "request_completed");
  assert.equal(final.kind, "background");
  assert.equal(final.route, "memory.extract");
  assert.equal(final.attempts.length, 2);
  assert.equal(final.businessSuccess, null);
  assert.equal(new Set(events.map(e => e.requestId)).size, 1);
});

const heartSignRequest = { baseUrl: "/api/functions", params: { name: "analyzeHeartSign" } };

test("cached heart-sign analysis is successful without replaying old attempts", async t => {
  const { events } = setup(t);
  const res = await http(() => ({
    ok: true, skipped: true, ai_analysis: { ai: { requestId: "old-request", attempts: [{ outcome: "success" }] } },
  }), { request: heartSignRequest });
  assert.notEqual(res.body.ai.requestId, "old-request");
  assert.deepEqual(res.body.ai.attempts, []);
  assert.equal(res.body.ai.source, "cached");
  assert.equal(res.body.ai.cached, true);
  assert.equal(events.at(-1).businessSuccess, true);
});

test("heart-sign processing acknowledgement has an unknown business outcome", async t => {
  const { events } = setup(t);
  const res = await http(() => ({ ok: true, skipped: true, message: "已有分析任务在进行中" }), { request: heartSignRequest });
  assert.equal(res.body.ai.source, "system");
  assert.equal(res.body.ai.cached, undefined);
  assert.equal(events.at(-1).businessSuccess, null);
});

for (const usedFallback of [false, true]) test(`heart-sign template attribution with analysis fallback=${usedFallback}`, async t => {
  const { events } = setup(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  const res = await http(async () => {
    await callKimiChat(options);
    return {
      ok: true, used_fallback: usedFallback,
      ai_analysis: { source: usedFallback ? "local_fallback" : "kimi", reply_source: "local_template" },
    };
  }, { request: heartSignRequest });
  const final = events.at(-1);
  assert.equal(final.analysisSource, usedFallback ? "fallback" : "ai");
  assert.equal(final.businessSuccess, !usedFallback);
  assert.equal(final.attempts[0].outcome, "success");
  for (const trace of [final, res.body.ai]) {
    assert.equal(trace.source, "fallback");
    assert.equal(trace.provider, null);
    assert.equal(trace.model, null);
  }
});

test("flow chat records a rejected plan adjustment as failure after a successful model call", async t => {
  const { events } = setup(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse('{"reply":"好的","extracted":null}'));
  const res = await http(() => runFlowChat({
    messages: [{ role: "user", content: "每周三次学习" }, { role: "user", content: "每天改到早上9点" }],
    lastExtracted: {
      type: "plan",
      plan_request: { goal: "英语学习", horizon_days: 7, daily_minutes: 30 },
      plan: { patterns: [{ plan_group: "学习", applies_to: "daily", session_type: "session",
        start_time: "10:00", duration_minutes: 30, title: "复习", description: "英语练习" }] },
    },
  }), { request: { baseUrl: "/api/chat", route: { path: "/" } } });
  assert.match(res.body.reply, /SESSION_COUNT/);
  assert.equal(res.body.extracted, null);
  const final = events.at(-1);
  assert.equal(final.businessSuccess, false);
  assert.equal(final.source, "fallback");
  assert.equal(final.provider, null);
  assert.equal(final.attempts[0].outcome, "success");
});

test("unexpected attempt fields are never serialized", async t => {
  const { events } = setup(t);
  await http(() => { recordAiAttempt({ provider: "kimi", model: "kimi-test", outcome: "success", apiKey: "PRIVATE_KEY", prompt: "PRIVATE_PROMPT", content: "PRIVATE_REPLY", upstreamRequestId: "sk-private" }); return { source: "ai" }; });
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_|sk-private/);
});

test("a detached job beginning after a quiet response retains the parent ID without fabricating an AI response", async t => {
  const { events } = setup(t);
  let start;
  let done;
  const completed = new Promise(resolve => { done = resolve; });
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  await http(() => {
    new Promise(resolve => { start = resolve; }).then(() => callKimiChat(options)).then(done);
    return { ok: true };
  }, { gate: false });
  assert.equal(events.length, 0);
  start(); await completed;
  const final = events.find(e => e.event === "request_completed");
  assert.equal(final.source, "system");
  assert.equal(final.businessSuccess, null);
  assert.equal(events.find(e => e.event === "completed").requestId, final.requestId);
  assert.equal(events.find(e => e.event === "completed").late, true);
});

for (const [response, reason] of [
  [() => new Response('{"error":{"code":"insufficient_balance"}}', { status: 429 }), "insufficient_balance"],
  [() => new Response('{"error":{"code":"rate_limit_reached"}}', { status: 429 }), "rate_limited"],
  [() => jsonResponse("bad json"), "invalid_json"],
  [() => jsonResponse(""), "empty_response"],
]) test(`explicit DeepSeek uses the same ${reason} taxonomy`, async t => {
  const { events } = setup(t);
  process.env.DEEPSEEK_API_KEY = "fake-key";
  process.env.CHAT_AI_EXPERIMENT_ENABLED = "1";
  t.mock.method(globalThis, "fetch", async url => { assert.match(url, /deepseek/); return response(); });
  await http(async () => { await assert.rejects(invokeDashboardAi({ prompt: "private" })); return { degraded: true }; }, { headers: { "X-Chat-AI-Provider": "deepseek" } });
  assert.equal(events.find(e => e.event === "completed").reason, reason);
  assert.equal(events.find(e => e.event === "request_started").requestedProvider, "deepseek");
});


test("reply metadata identifies its model even if later preparatory work uses another model", async t => {
  setup(t);
  t.mock.method(globalThis, "fetch", async () => jsonResponse());
  const res = await http(async () => {
    await callKimiChat(options);
    const finalReply = aiTrace("ai");
    await callKimiChat({ ...options, models: ["preparatory-model"] });
    return { reply: { meta: { ai: finalReply } } };
  });
  assert.equal(res.body.ai.model, "kimi-test");
  assert.equal(res.body.ai.attempts.length, 2);
});


for (const source of ["agent", "credits"]) {
  for (const preparatoryCall of [false, true]) test(`${source} receipts remain system results after preparatory AI=${preparatoryCall}`, async t => {
    const { events } = setup(t);
    t.mock.method(globalThis, "fetch", async () => jsonResponse());
    const res = await http(async () => {
      if (preparatoryCall) await callKimiChat(options);
      assert.equal(aiTrace(source).source, "system");
      return { source, reply: "receipt" };
    });
    assert.equal(res.body.ai.source, "system");
    assert.equal(res.body.ai.provider, null);
    assert.equal(res.body.ai.model, null);
    assert.equal(events.find(e => e.event === "request_completed").businessSuccess, null);
  });
}


for (const [name, invoke] of [
  ["Kimi chat", () => callKimiChat(options)],
  ["dashboard Kimi", () => invokeDashboardAi({ prompt: "private" })],
  ["dashboard DeepSeek", () => invokeDashboardAi({ prompt: "private" }, { provider: "deepseek" })],
]) test(`${name} missing configuration is traced on a nongated HTTP route without inventing an attempt`, async t => {
  const { events } = setup(t);
  delete process.env.KIMI_API_KEY;
  t.mock.method(globalThis, "fetch", () => assert.fail("configuration failure must not issue a model request"));
  const res = await http(async () => {
    await assert.rejects(invoke());
    return { degraded: true };
  }, { gate: false });
  assert.equal(res.body.ai.source, "fallback");
  assert.deepEqual(res.body.ai.attempts, []);
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "request_started");
  assert.equal(events[1].event, "request_completed");
  assert.equal(events[1].requestId, events[0].requestId);
  assert.equal(events[1].businessSuccess, false);
  assert.equal(events[1].source, "fallback");
  assert.deepEqual(events[1].attemptIds, []);
});
