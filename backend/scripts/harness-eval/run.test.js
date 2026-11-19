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
    KIMI_API_KEY: "",
    MOONSHOT_API_KEY: "",
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
    assert.equal(String(url), "https://api.deepseek.com/chat/completions", "external network is disabled");
    const body = JSON.parse(options.body);
    const phase = body.messages[0].content.startsWith("你是约定规划师") ? "planner" : "chat";
    calls.push({ phase, prompt: body.messages[1].content });
    const next = answers.shift();
    if (!next || next.phase !== phase) return new Response("unexpected fixture call", { status: 500 });
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

function intent({ goal = "英语词汇复习", days = 7, minutes = 20 } = {}) {
  answers.push({ phase: "chat", data: {
    reply: "我来帮你安排。",
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

async function post(path, body, account = user) {
  const res = await nativeFetch(base + path, {
    method: "POST",
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
  await db.memoryRecord.create({ data: {
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
  intent({ minutes: null });
  const first = await send("帮我规划一周英语词汇复习，每周三次");
  assert.match(first.reply.content, /分钟/);
  assert.equal(first.extracted, null);
  assert.equal(plannerCalls().length, 0);
  intent({ minutes: 20 });
  draft();
  assertSchedule(await send("每次20分钟"), 20);
  assert.equal(plannerCalls().length, 1);
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
  intent({ minutes: 45 }); // The chat model guesses. The harness must clarify.
  const result = await send("帮我规划一周英语词汇复习，每周三次，按我平常的上限");
  assert.match(result.reply.content, /分钟|上限/);
  assert.equal(result.extracted, null);
  assert.equal(plannerCalls().length, 0);
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
  chatOnly();
  const changed = await send("周六早上11点", first.extracted);
  assertSchedule(changed, 20, ["10:00", "10:00", "11:00"]);
  assert.deepEqual(mainSessions(changed).slice(0, 2), mainSessions(first).slice(0, 2));
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
