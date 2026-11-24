import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { after, before, beforeEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

const backend = fileURLToPath(new URL("../../", import.meta.url));
const now = new Date("2026-11-16T00:00:00.000Z"); // Monday 08:00 in China
const sendPath = "/api/companion/messages";
const nativeFetch = globalThis.fetch;
const nativeSetTimeout = globalThis.setTimeout;
const study = "帮我规划一周英语词汇复习，每周三次，每次最多20分钟";
let dir, server, db, sign, user, other, base, calls, answers;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "soulsentry-harness-eval-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "file:" + join(dir, "eval.db"),
    JWT_SECRET: "harness-eval-synthetic-only",
    CHAT_AI_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "local-test",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1",
    DEEPSEEK_MODELS: "deepseek-chat",
    KIMI_API_KEY: "",
    KIMI_FALLBACK_API_KEY: "",
    MOONSHOT_API_KEY: "",
    MOONSHOT_FALLBACK_API_KEY: "",
    WECHAT_APPID: "",
    WECHAT_APP_SECRET: "",
    MEMORY_LEARNING_ENABLED: "0",
    MEMORY_HYBRID_ENABLED: "0",
  });
  const schema = execFileSync(process.execPath, [
    join(backend, "node_modules/prisma/build/index.js"), "migrate", "diff",
    "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script",
  ], { cwd: backend, encoding: "utf8" });
  const sqlite = new DatabaseSync(join(dir, "eval.db"));
  try {
    sqlite.exec(schema);
  } finally {
    sqlite.close();
  }

  ({ prisma: db } = await import("../../src/lib/prisma.js"));
  ({ signAccessToken: sign } = await import("../../src/lib/jwt.js"));
  const { app } = await import("../../src/app.js");
  mock.timers.enable({ apis: ["Date"], now });
  // The baseline leaves its HTTP watchdog timers pending after responding.
  mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    const timer = nativeSetTimeout(callback, delay, ...args);
    return delay >= 35000 ? timer.unref() : timer;
  });
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.ok([
      "https://api.deepseek.com/chat/completions",
      "https://api.deepseek.com/v1/chat/completions",
      "https://api.moonshot.cn/v1/chat/completions",
    ].includes(String(url)), "external network is disabled");
    const body = JSON.parse(options.body);
    const phase = body.messages[0].content.startsWith("你是约定规划师") ? "planner" : "chat";
    calls.push({ phase, model: body.model, prompt: body.messages[1].content });
    const next = answers.shift();
    if (!next || next.phase !== phase) return new Response("unexpected fixture call", { status: 500 });
    if (next.timeout) throw new DOMException("synthetic timeout", "TimeoutError");
    if (next.status) return new Response("fixture provider error", { status: next.status });
    return Response.json({ choices: [{ message: { content: next.raw ?? JSON.stringify(next.data) } }] });
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = "http://127.0.0.1:" + server.address().port;
});

beforeEach(async () => {
  user = await db.user.create({ data: {} });
  other = await db.user.create({ data: {} });
  calls = [];
  answers = [];
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect();
  mock.restoreAll();
  mock.timers.reset();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function intent({ goal = "英语词汇复习", days = 7, minutes = 20, reply = "我来帮你安排。", clarificationField } = {}) {
  answers.push({ phase: "chat", data: {
    reply,
    clarification_field: clarificationField,
    extracted: { type: "plan", plan_request: { goal, horizon_days: days, daily_minutes: minutes } },
  } });
}

function chatOnly() {
  answers.push({ phase: "chat", data: { reply: "我听着呢。", extracted: null } });
}

function draft({ days = "周一,周三,周六", start = "10:00", minutes = 20, training = false } = {}) {
  answers.push({ phase: "planner", data: {
    parent: { title: training ? "居家训练" : "单词复习", description: "每周分三次练习" },
    patterns: [{
      plan_group: training ? "训练" : "复习",
      session_type: "session", applies_to: days, start_time: start, duration_minutes: minutes,
      title: training ? "哑铃划船" : "用纸质词卡复习",
      description: training ? "哑铃划船3组12次" : "用纸质词卡自测",
    }],
  } });
}

async function post(path, body, account = user, method = "POST") {
  const res = await nativeFetch(base + path, {
    method,
    headers: { authorization: "Bearer " + sign(account), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: res.headers.get("content-type")?.includes("application/json") ? await res.json() : null };
}

async function send(content, last_extracted) {
  const { status, data } = await post(sendPath, { content, last_extracted });
  assert.equal(status, 200);
  return data;
}

function mainSessions(result) {
  return result.extracted?.plan?.children.filter((child) => child.session_type === "session") ?? [];
}

function plannerCalls() {
  return calls.filter(({ phase }) => phase === "planner");
}

function assertSchedule(result, minutes, starts = ["10:00", "10:00", "10:00"]) {
  const sessions = mainSessions(result);
  assert.deepEqual(sessions.map(({ date }) => date), ["2026-11-16", "2026-11-18", "2026-11-21"]);
  assert.deepEqual(sessions.map(({ start_time }) => start_time), starts);
  assert.deepEqual(sessions.map(({ duration_minutes }) => duration_minutes), [minutes, minutes, minutes]);
}

function confirm(id, account = user, body = {}) {
  return post("/api/tasks/plan-proposals/" + id + "/confirm", body, account);
}

function tasks(account = user) {
  return db.task.findMany({ where: { userId: account.id }, orderBy: { reminderTime: "asc" } });
}

function busy(start, end, account = user) {
  return db.task.create({ data: {
    userId: account.id, title: "已约定的外出",
    reminderTime: new Date(start + "+08:00"), endTime: new Date(end + "+08:00"),
  } });
}

async function memoryLimit(topic, content, { subject = "self", expiresAt } = {}) {
  return db.memoryRecord.create({ data: {
    userId: user.id, title: content, content, memoryType: "preference",
    fact: { create: { userId: user.id, subject, topic, attribute: "session_limit", aliases: [], expiresAt } },
  } });
}

test("keeps a shorter valid study session under an explicit maximum", async () => {
  intent();
  draft({ minutes: 15 });
  const result = await send(study + "，请用纸质词卡");
  assertSchedule(result, 15);
  assert.ok(mainSessions(result).every(({ description }) => description.includes("纸质词卡")));
  assert.equal(plannerCalls().length, 1);
  assert.deepEqual(await tasks(), []);
});

test("routes a complete home workout through the same workflow", async () => {
  intent({ goal: "居家练背", minutes: 45 });
  draft({ minutes: 45, training: true });
  const result = await send("帮我做一周居家练背计划，每周三次，每次45分钟，我是新手，只有哑铃");
  assertSchedule(result, 45);
  assert.ok(mainSessions(result).every(({ description }) => description === "哑铃划船3组12次"));
  assert.equal(plannerCalls().length, 1);
});

test("asks for a missing duration and continues with the user's second turn", async () => {
  const question = "每次背单词，你想留多长时间？";
  intent({ minutes: null, reply: question, clarificationField: "daily_minutes" });
  const first = await send("帮我规划一周英语词汇复习，每周三次");
  assert.equal(first.reply.content, question);
  assert.equal(calls.length, 1);
  assert.deepEqual(await tasks(), []);
  assert.equal(first.extracted, null);
  assert.equal(plannerCalls().length, 0);
  intent({ minutes: 20 });
  draft();
  assertSchedule(await send("每次20分钟"), 20);
  assert.equal(plannerCalls().length, 1);
});

test("uses the model's contextual question when the planning horizon is missing", async () => {
  const question = "你想先定多长的词汇复习周期呢？";
  intent({ days: null, reply: question });
  const result = await send("帮我做个英语词汇复习计划，每次20分钟");
  assert.equal(result.reply.content, question);
  assert.equal(result.extracted, null);
  assert.equal(calls.length, 1);
  assert.equal(plannerCalls().length, 0);
  assert.deepEqual(await tasks(), []);
});

test("rejects a model question aimed at the wrong missing field", async () => {
  intent({ days: null, reply: "你想为每次背词留多久？", clarificationField: "daily_minutes" });
  const result = await send("帮我做个英语词汇复习计划，每次20分钟");
  assert.match(result.reply.content, /计划想坚持多少天/);
  assert.equal(result.extracted, null);
  assert.equal(calls.length, 1);
  assert.equal(plannerCalls().length, 0);
});

test("keeps only the question that matches the missing field", async () => {
  const question = "那单次跟读想留多长时间呢？";
  intent({ goal: "西语跟读", minutes: null, reply: "七天跟读，每周三次，我记下了。" + question + "另外你更喜欢早上还是晚上？" });
  const result = await send("帮我安排一周西语跟读计划，每周三次");
  assert.equal(result.reply.content, question);
  assert.equal(result.extracted, null);
  assert.equal(calls.length, 1);
  assert.equal(plannerCalls().length, 0);
});

test("uses a safe follow-up when the model labels unrelated wording as a duration question", async () => {
  intent({ minutes: null, reply: "你是想安排到周几？", clarificationField: "daily_minutes" });
  const result = await send("帮我规划一周英语词汇复习，每周三次");
  assert.equal(result.reply.content, "每次大概能投入多少分钟？");
  assert.equal(result.extracted, null);
  assert.equal(calls.length, 1);
  assert.equal(plannerCalls().length, 0);
});

test("does not plan in response to ordinary chat", async () => {
  chatOnly();
  const result = await send("今天心情不错");
  assert.equal(result.extracted, null);
  assert.equal(plannerCalls().length, 0);
});

test("ignores wrong-topic and expired durations and applies the current study cap", async () => {
  await memoryLimit("english_vocabulary", "英语词汇复习每次最多20分钟");
  await memoryLimit("reading", "英语阅读每次最多45分钟");
  await memoryLimit("english_vocabulary", "英语词汇复习每次最多60分钟", { expiresAt: new Date("2026-11-15T00:00:00Z") });
  intent({ minutes: 45 });
  draft();
  assertSchedule(await send("帮我规划一周英语词汇复习，每周三次，按我平常的上限"), 20);
  assert.equal(plannerCalls().length, 1);
});

test("asks for the remembered duration when retrieved evidence belongs only to another activity", async () => {
  await memoryLimit("reading", "英语阅读每次最多45分钟");
  const question = "结合你这周的节奏，背词一回最多能留多少分钟？";
  intent({ minutes: 45, reply: question, clarificationField: "daily_minutes" });
  const result = await send("帮我规划一周英语词汇复习，每周三次，按我平常的上限");
  assert.ok(result.reply.content.startsWith(question));
  assert.equal(calls.length, 1);
  assert.equal(result.extracted, null);
  assert.equal(plannerCalls().length, 0);
});

test("allows a natural question about competing duration limits without a provider field tag", async () => {
  await memoryLimit("english_vocabulary", "英语词汇复习每次最多20分钟");
  await memoryLimit("english_vocabulary", "英语词汇复习每次最多45分钟");
  const question = "单次时长我看到20分钟和45分钟，你现在想按哪个来安排？";
  intent({ minutes: null, reply: question });
  const result = await send("帮我规划一周英语词汇复习，每周三次，按我平常的上限");
  assert.ok(result.reply.content.startsWith(question));
  assert.equal(result.extracted, null);
  assert.equal(calls.length, 1);
  assert.equal(plannerCalls().length, 0);
  assert.deepEqual(await tasks(), []);
});

test("prefers this turn's explicit cap to a saved limit or model guess", async () => {
  await memoryLimit("english_vocabulary", "英语词汇复习每次最多20分钟");
  intent({ minutes: 20 });
  draft({ minutes: 15 });
  assertSchedule(await send("帮我规划一周英语词汇复习，每周三次，这次每次最多15分钟"), 15);
  assert.equal(plannerCalls().length, 1);
});

test("returns an actionable clarification when explicit weekday constraints are impossible", async () => {
  intent();
  const result = await send("帮我规划一周阅读，每周七次，每次20分钟，我只在工作日晚上有空，但工作日晚上没空");
  assert.equal(result.extracted, null);
  assert.match(result.reply.content, /时段|时间|哪几天|次数/);
  assert.equal(plannerCalls().length, 0);
});

test("repairs two independently observable violations before showing the proposal", async () => {
  await busy("2026-11-16T10:00:00", "2026-11-16T10:30:00");
  intent();
  draft({ days: "周一,周三,周五,周六" });
  draft({ start: "10:30" });
  assertSchedule(await send(study), 20, ["10:30", "10:30", "10:30"]);
  assert.equal(plannerCalls().length, 2);
  assert.match(plannerCalls()[1].prompt, /需要\s*3\s*次/);
  assert.match(plannerCalls()[1].prompt, /冲突|重叠/);
  assert.equal((await tasks()).length, 1); // Only the pre-existing busy task.
});

test("blocks the card after the single repair also fails", async () => {
  intent();
  draft({ days: "周一,周二,周三,周六" });
  draft({ days: "周一,周二,周三,周六" });
  const result = await send(study + "，工作日晚上没空");
  assert.equal(result.extracted, null);
  assert.match(result.reply.content, /需要\s*3\s*次/);
  assert.equal(plannerCalls().length, 2);
  assert.deepEqual(await tasks(), []);
});

test("recovers malformed planner JSON in one repair", async () => {
  intent();
  answers.push({ phase: "planner", raw: "{broken" });
  draft();
  assertSchedule(await send(study), 20);
  assert.equal(plannerCalls().length, 2);
  assert.match(plannerCalls()[1].prompt, /JSON|格式/);
});

test("shows a provider outage without a repair, proposal, or task", async () => {
  intent();
  answers.push({ phase: "planner", status: 503 });
  const result = await send(study);
  assert.equal(result.extracted, null);
  assert.match(result.reply.content, /暂时无法|暂不可用/);
  assert.equal(plannerCalls().length, 1);
  assert.deepEqual(await tasks(), []);
});

test("adjusts a Saturday proposal locally and keeps the original sessions intact", async () => {
  intent();
  draft();
  const first = await send(study);
  const changed = await send("周六早上11点", first.extracted);
  assertSchedule(changed, 20, ["10:00", "10:00", "11:00"]);
  assert.deepEqual(mainSessions(changed).slice(0, 2), mainSessions(first).slice(0, 2));
  assert.equal(calls.filter(({ phase }) => phase === "chat").length, 1);
  assert.equal(plannerCalls().length, 1);
  assert.deepEqual(await tasks(), []);
});

test("binds confirmation to the proposal and commits exactly once under parallel retry", async () => {
  intent();
  draft();
  const { extracted } = await send(study);
  assert.deepEqual(await tasks(), []);
  const id = extracted?.plan_proposal_id ?? extracted?.memory_proposal_id;
  assert.ok(id);
  const [a, b] = await Promise.all([confirm(id), confirm(id)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.data.parent.id, b.data.parent.id);
  const replay = await confirm(id);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.parent.id, a.data.parent.id);
  const saved = await tasks();
  assert.equal(saved.length, 1 + extracted.plan.children.length);
  assert.deepEqual(saved.slice(1).map(({ title, parentTaskId }) => [title, parentTaskId]),
    extracted.plan.children.map(({ title }) => [title, a.data.parent.id]));
  assert.equal(await db.memoryTaskSignal.count({ where: { userId: user.id, kind: "confirmed_plan" } }), 1);
});

test("scopes confirmation and rechecks busy time before saving", async () => {
  intent();
  draft();
  const { extracted } = await send(study);
  const id = extracted?.plan_proposal_id ?? extracted?.memory_proposal_id;
  assert.ok(id);
  const foreign = await confirm(id, other);
  assert.equal(foreign.status, 404);
  assert.equal(foreign.data?.error, "PLAN_PROPOSAL_NOT_FOUND");
  assert.deepEqual(await tasks(other), []);
  const unknown = await confirm(randomUUID());
  assert.equal(unknown.status, 404);
  assert.equal(unknown.data?.error, "PLAN_PROPOSAL_NOT_FOUND");
  await busy("2026-11-18T09:45:00", "2026-11-18T10:30:00");
  const lateConflict = await confirm(id, user, { parent: { title: "客户端替换" } });
  assert.equal(lateConflict.status, 409);
  assert.equal(lateConflict.data?.error, "PLAN_CONFLICT");
  assert.equal((await tasks()).length, 1);
});

test("retains the legacy idempotent task plan endpoint for generic task creation", async () => {
  const body = { proposal_id: randomUUID(), parent: { title: "手动约定" }, children: [{ title: "手动子约定" }] };
  const first = await post("/api/tasks/plan", body);
  const second = await post("/api/tasks/plan", body);
  assert.deepEqual([first.status, second.status], [201, 200]);
  assert.equal(first.data.parent.id, second.data.parent.id);
  assert.equal((await tasks()).length, 2);
});

test("asks for an unspecified duration even if the chat model supplies a guess", async () => {
  intent();
  const result = await send("帮我做一周英语词汇练习计划，每周三次");
  assert.match(result.reply.content, /分钟/);
  assert.equal(result.extracted, null);
  assert.equal(plannerCalls().length, 0);
});

test("times out promptly without calling a repair", async () => {
  intent();
  answers.push({ phase: "planner", timeout: true });
  const result = await send(study);
  assert.equal(result.extracted, null);
  assert.match(result.reply.content, /超时/);
  assert.equal(plannerCalls().length, 1);
  assert.deepEqual(await tasks(), []);
});

test("keeps the main duration when a model adds an unnecessary recovery template", async () => {
  intent();
  draft();
  answers.at(-1).data.patterns.unshift({
    plan_group: "休息", session_type: "recovery", applies_to: "周一", start_time: "09:00",
    duration_minutes: 15, title: "提前休息", description: "放松",
  });
  const result = await send(study);
  assertSchedule(result, 20);
  assert.equal(result.extracted.plan.children.length, 3);
  assert.equal(plannerCalls().length, 1);
});

test("checks only the owner's busy periods and accepts an adjacent time slot", async () => {
  await busy("2026-11-16T10:00:00", "2026-11-16T10:30:00", other);
  await busy("2026-11-18T09:30:00", "2026-11-18T10:00:00");
  intent();
  draft();
  assertSchedule(await send(study), 20);
  assert.equal(plannerCalls().length, 1);
});

test("legacy homepage confirmation uses the canonical proposal and shares its idempotency key", async () => {
  intent();
  draft();
  const { extracted } = await send(study);
  const old = await post("/api/tasks/plan", {
    proposal_id: randomUUID(), memory_proposal_id: extracted.memory_proposal_id,
    parent: { title: "客户端替换" }, children: [{ title: "客户端替换" }],
  });
  assert.equal(old.status, 201);
  assert.equal(old.data.parent.title, extracted.plan.parent.title);
  const modern = await confirm(extracted.plan_proposal_id);
  assert.equal(modern.status, 200);
  assert.equal(modern.data.parent.id, old.data.parent.id);
  const saved = await tasks();
  assert.equal(saved.length, extracted.plan.children.length + 1);
  assert.deepEqual(saved.slice(1).map(({ reminderTime }) => reminderTime.toISOString()), [
    "2026-11-16T02:00:00.000Z", "2026-11-18T02:00:00.000Z", "2026-11-21T02:00:00.000Z",
  ]);
  assert.equal(await db.taskExecution.count({ where: { userId: user.id } }), 0);
});

test("defaults to Kimi and preserves production DeepSeek recovery for invalid planner JSON", async (t) => {
  const original = process.env.CHAT_AI_PROVIDER;
  delete process.env.CHAT_AI_PROVIDER;
  process.env.KIMI_API_KEY = "local-test";
  process.env.KIMI_BASE_URL = "https://api.moonshot.cn/v1";
  t.after(() => {
    process.env.CHAT_AI_PROVIDER = original;
    process.env.KIMI_API_KEY = "";
    delete process.env.KIMI_BASE_URL;
  });
  intent();
  answers.push({ phase: "planner", raw: "{broken" });
  draft();
  assertSchedule(await send(study), 20);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].model.startsWith("kimi-"));
  assert.equal(calls[1].model, "kimi-k3");
  assert.equal(calls[2].model, "deepseek-chat");
  assert.equal(plannerCalls().length, 2);
});

test("forgetting a remembered limit invalidates its proposal and restores the clarification gate", async () => {
  const memory = await memoryLimit("english_vocabulary", "英语词汇复习每次最多20分钟");
  const query = "帮我规划一周英语词汇复习，每周三次，按我平常的上限";
  intent();
  draft();
  const first = await send(query);
  assertSchedule(first, 20);
  const removed = await post("/api/memory-records/" + memory.id, undefined, user, "DELETE");
  assert.equal(removed.status, 204);
  assert.equal((await confirm(first.extracted.plan_proposal_id)).status, 404);
  intent({ minutes: 20 });
  const next = await send(query);
  assert.equal(next.extracted, null);
  assert.match(next.reply.content, /分钟|上限/);
  assert.equal(plannerCalls().length, 1);
  assert.deepEqual(await tasks(), []);
});

test("replays the same invalid first draft with zero repairs and with one repair", async () => {
  const { planCommitmentWithKimi } = await import("../../src/services/planCommitment.js");
  draft({ days: "周一,周二,周三,周六" });
  draft();
  const [first, revised] = answers.splice(0);
  const constraints = {
    checkWindows: true, startDate: "2026-11-16", horizonDays: 7, sessionsPerWeek: 3,
    maxSessionMinutes: 20, busy: [],
  };
  const shared = { goal: "英语词汇复习", horizonDays: 7, dailyMinutes: 20, constraints };
  let callsWithoutRepair = 0;
  await assert.rejects(planCommitmentWithKimi({
    ...shared,
    maxRepairs: 0,
    invoke: async () => { callsWithoutRepair += 1; return { data: first.data }; },
  }), /SESSION_COUNT/);
  const prompts = [];
  const result = await planCommitmentWithKimi({
    ...shared,
    maxRepairs: 1,
    invoke: async ({ prompt }) => {
      prompts.push(prompt);
      return { data: prompts.length === 1 ? first.data : revised.data };
    },
  });
  assert.equal(callsWithoutRepair, 1);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /SESSION_COUNT/);
  assertSchedule({ extracted: { plan: result } }, 20);
});

test("keeps production Kimi K2.7 and DeepSeek fallback for both today chat routes", async (t) => {
  const original = process.env.CHAT_AI_PROVIDER;
  delete process.env.CHAT_AI_PROVIDER;
  process.env.KIMI_API_KEY = "local-test";
  process.env.KIMI_BASE_URL = "https://api.moonshot.cn/v1";
  t.after(() => {
    process.env.CHAT_AI_PROVIDER = original;
    process.env.KIMI_API_KEY = "";
    delete process.env.KIMI_BASE_URL;
  });
  answers.push({ phase: "chat", status: 401 });
  chatOnly();
  const result = await post("/api/chat", { messages: [{ role: "user", content: "今天想整理一下思路。" }] });
  assert.equal(result.status, 200);
  assert.equal(result.data.reply, "我听着呢。");
  assert.deepEqual(calls.map(({ model }) => model), ["kimi-k2.7-code-highspeed", "deepseek-chat"]);
  answers.push({ phase: "chat", status: 401 });
  chatOnly();
  const companion = await send("连通性测试，请只回复收到。");
  assert.equal(companion.reply.content, "我听着呢。");
  assert.equal(companion.reply.meta.ai.provider, "deepseek");
  assert.deepEqual(calls.slice(-2).map(({ model }) => model), ["kimi-k2.7-code-highspeed", "deepseek-chat"]);
});
