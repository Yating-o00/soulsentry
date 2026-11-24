import test from "node:test";
import assert from "node:assert/strict";
import { aiRequestContext, aiTrace } from "./aiContext.js";
import { invokeDashboardAi } from "./dashboardAi.js";
import { callKimiChat } from "./kimi.js";
function setup(t) {
  const names = ["CHAT_AI_EXPERIMENT_ENABLED", "CHAT_AI_PROVIDER", "KIMI_API_KEY", "MOONSHOT_API_KEY", "KIMI_FALLBACK_API_KEY", "MOONSHOT_FALLBACK_API_KEY", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_MODELS"];
  const old = names.map(n => [n, process.env[n]]);
  names.forEach(n => delete process.env[n]);
  t.after(() => old.forEach(([n,v]) => v === undefined ? delete process.env[n] : process.env[n] = v));
  process.env.KIMI_API_KEY = "fake"; process.env.DEEPSEEK_API_KEY = "fake";
}
function request(provider, work) {
  return new Promise((resolve, reject) => {
    const req = { get: () => provider, baseUrl: "/api/chat", path: "/" };
    const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    aiRequestContext(req, res, () => Promise.resolve().then(work).then(result => res.json(result)).catch(reject));
  });
}
const options = { prompt: "test", responseJsonSchema: true, withUsage: true, models: ["kimi-test"] };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"ok"}' } }] }));

test("singleAttempt preserves production endpoint fallback and tries one model per endpoint", async t => {
  setup(t); process.env.KIMI_FALLBACK_API_KEY = "other";
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => { calls.push(url); return url.includes("deepseek") ? ok() : new Response("unavailable", {status: 429}); });
  const result = await request(undefined, async () => { await invokeDashboardAi({...options, singleAttempt: true}); return {source: "ai"}; });
  assert.equal(calls.length, 3);
  assert.equal(result.body.ai.provider, "deepseek");
  assert.equal(result.body.ai.attempts[0].reason, "http_429");
});
test("explicit DeepSeek never calls Kimi", async t => {
  setup(t); process.env.CHAT_AI_EXPERIMENT_ENABLED = "1";
  const fetch = t.mock.method(globalThis, "fetch", async url => { assert.match(url, /deepseek/); return ok(); });
  const result = await request("deepseek", async () => { await invokeDashboardAi(options); return {source: "ai"}; });
  assert.equal(fetch.mock.callCount(), 1); assert.equal(result.body.ai.provider, "deepseek");
});
test("invalid, disabled and unavailable choices are rejected before the handler", async t => {
  setup(t); const fail = () => assert.fail("must not run handler");
  assert.equal((await request("unknown", fail)).status, 400);
  assert.equal((await request("deepseek", fail)).status, 403);
  process.env.CHAT_AI_EXPERIMENT_ENABLED = "1"; delete process.env.DEEPSEEK_API_KEY;
  assert.equal((await request("deepseek", fail)).status, 503);
});
test("simultaneous users retain separate providers and request IDs", async t => {
  setup(t); process.env.CHAT_AI_EXPERIMENT_ENABLED = "1";
  t.mock.method(globalThis, "fetch", async () => ok());
  const [kimi, ds] = await Promise.all(["kimi", "deepseek"].map(provider => request(provider, async () => { await invokeDashboardAi(options); return {source: "ai"}; })));
  assert.equal(kimi.body.ai.provider, "kimi"); assert.equal(ds.body.ai.provider, "deepseek");
  assert.notEqual(kimi.body.ai.requestId, ds.body.ai.requestId); assert.equal(aiTrace(), null);
});
test("template following a successful preparatory call is labeled fallback", async t => {
  setup(t); t.mock.method(globalThis, "fetch", async () => ok());
  const result = await request(undefined, async () => { await invokeDashboardAi(options); return {degraded: true}; });
  assert.equal(result.body.ai.source, "fallback"); assert.equal(result.body.ai.provider, null);
  assert.equal(result.body.ai.attempts.length, 1);
});
test("empty responses are traced and fall back", async t => {
  setup(t);
  t.mock.method(globalThis, "fetch", async url => url.includes("deepseek") ? ok() : new Response('{"choices":[{"message":{"content":""}}]}'));
  const result = await request(undefined, async () => { await invokeDashboardAi(options); return {source: "ai"}; });
  assert.equal(result.body.ai.attempts[0].reason, "empty_response"); assert.equal(result.body.ai.provider, "deepseek");
  assert.doesNotMatch(JSON.stringify(result.body.ai), /fake|Authorization/);
});
test("image and web failures do not fall back to text-only DeepSeek", async t => {
  setup(t);
  const fetch = t.mock.method(globalThis, "fetch", async url => { assert.doesNotMatch(url, /deepseek/); return new Response("unavailable", {status: 503}); });
  await assert.rejects(callKimiChat({messages: [{role: "user", content: [{type: "image_url", image_url: {url: "data:image/png;base64,test"}}]}], models: ["vision-test"]}));
  await assert.rejects(callKimiChat({messages: [{role: "user", content: "search"}], models: ["web-test"], tools: [{type: "builtin_function"}]}));
  assert.equal(fetch.mock.callCount(), 2);
});
