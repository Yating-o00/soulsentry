import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  activeMemoryScope, createMemory, forgetMemory, memoryHistory, memorySource, recallableMessageScope, restoreMemory, updateMemory,
} from "./memoryStore.js";
import { enqueueMemoryMessage, runMemoryJob } from "./memoryWorker.js";
import { buildMemoryTopicSummary, loadMemoryContext, loadRememberedCommitments, proposeMemoryRecap, renderMemoryContext, saveMemoryRecap } from "./memoryContext.js";
import { memoryVectorScores } from "./memoryEmbeddings.js";

const backend = fileURLToPath(new URL("../../", import.meta.url));

async function testDatabase(t) {
  const dir = await mkdtemp(join(tmpdir(), "soulsentry-memory-"));
  const path = join(dir, "test.db");
  const ddl = execFileSync(join(backend, "node_modules/.bin/prisma"), [
    "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script",
  ], { cwd: backend, encoding: "utf8" });
  execFileSync("sqlite3", [path], { input: ddl });
  const db = new PrismaClient({ datasourceUrl: "file:" + path });
  t.after(async () => {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });
  return db;
}

test("legacy record gains history, restore appends a revision, and forgetting hides echoes without deleting the chat", async (t) => {
  const db = await testDatabase(t);
  const owner = await db.user.create({ data: { id: "owner" } });
  const intruder = await db.user.create({ data: { id: "intruder" } });
  const source = await db.companionMessage.create({
    data: { userId: owner.id, role: "user", content: "记住：我练背只用哑铃" },
  });
  const legacy = await db.memoryRecord.create({
    data: { userId: owner.id, title: "我练背只用哑铃", aiInsight: { sourceMessageId: source.id, topic: "exercise" } },
  });
  const echo = await db.companionMessage.create({
    data: { userId: owner.id, role: "assistant", content: "好的，我记住了：我练背只用哑铃" },
  });
  const unrelated = await db.companionMessage.create({
    data: { userId: owner.id, role: "user", content: "晚餐吃什么？" },
  });
  const key = { id: legacy.id, userId: owner.id };
  const foreign = { id: legacy.id, userId: intruder.id };
  const initial = await memoryHistory(db, key);
  assert.deepEqual(initial.revisions[0].sourceMessageIds, [source.id]);
  assert.equal(initial.version, 1);
  await assert.rejects(memoryHistory(db, foreign), { code: "MEMORY_NOT_FOUND" });
  await assert.rejects(memorySource(db, { ...foreign, version: 1, messageId: source.id }), { code: "MEMORY_NOT_FOUND" });
  await assert.rejects(db.$transaction((tx) => createMemory(tx, {
    userId: intruder.id, data: { title: "外部来源" }, sourceIds: [source.id],
  })), { code: "INVALID_MEMORY_SOURCE" });

  const edited = await db.$transaction((tx) => updateMemory(tx, {
    ...key, expectedVersion: 1, data: { title: "练背只用弹力带" },
  }));
  assert.equal(edited.revisions[0].version, 2);
  assert.equal(edited.aiInsight.topic, "exercise");
  await assert.rejects(db.$transaction((tx) => updateMemory(tx, {
    ...key, expectedVersion: 1, data: { title: "不能覆盖" },
  })), { code: "MEMORY_CONFLICT" });
  await assert.rejects(db.$transaction((tx) => restoreMemory(tx, { ...foreign, expectedVersion: 2, version: 1 })), { code: "MEMORY_NOT_FOUND" });

  const restored = await db.$transaction((tx) => restoreMemory(tx, { ...key, expectedVersion: 2, version: 1 }));
  assert.equal(restored.title, legacy.title);
  const history = await memoryHistory(db, key);
  assert.deepEqual(history.revisions.map(({ version, reason }) => [version, reason]), [[3, "restore"], [2, "edit"], [1, "legacy"]]);
  assert.equal((await memorySource(db, { ...key, version: 1, messageId: source.id })).content, source.content);

  const paraphrased = await db.companionMessage.create({
    data: { userId: owner.id, role: "assistant", content: "可以选自由重量", meta: { memoryIds: [legacy.id] } },
  });
  await db.$transaction((tx) => forgetMemory(tx, key));
  assert.equal(await db.memoryRevision.count(), 0);
  assert.equal(await db.memorySuppression.count(), 3);
  const visible = await db.companionMessage.findMany({ where: recallableMessageScope(owner.id), select: { id: true } });
  assert.deepEqual(visible, [{ id: unrelated.id }]);
  for (const id of [source.id, echo.id, paraphrased.id]) {
    assert.ok(await db.companionMessage.findUnique({ where: { id } }));
  }
  await assert.rejects(db.$transaction((tx) => createMemory(tx, {
    userId: owner.id, actor: "worker", data: { title: legacy.title }, sourceIds: [source.id],
  })), { code: "INVALID_MEMORY_SOURCE" });
});

test("durable jobs learn an implicit correction and retire the old value without replaying the event", async (t) => {
  const previousSetting = process.env.MEMORY_LEARNING_ENABLED;
  process.env.MEMORY_LEARNING_ENABLED = "1";
  t.after(() => {
    if (previousSetting === undefined) delete process.env.MEMORY_LEARNING_ENABLED;
    else process.env.MEMORY_LEARNING_ENABLED = previousSetting;
  });
  const db = await testDatabase(t);
  const { id: userId } = await db.user.create({ data: { id: "learner" } });
  const oldMessage = await db.companionMessage.create({
    data: { userId, role: "user", content: "记住：我复习英语词汇每次最多30分钟" },
  });
  const oldRecord = await db.$transaction((tx) => createMemory(tx, {
    userId, data: { title: "我复习英语词汇每次最多30分钟" }, sourceIds: [oldMessage.id], reason: "explicit_chat",
  }));
  const statement = "现在我复习英语词汇每次最多20分钟";
  const source = await db.$transaction(async (tx) => {
    const source = await tx.companionMessage.create({ data: { userId, role: "user", content: statement } });
    await enqueueMemoryMessage(tx, source);
    await enqueueMemoryMessage(tx, source);
    return source;
  });
  assert.equal(await db.memoryJob.count(), 1);
  let now = new Date(Date.now() + 1000);
  const clock = () => now;
  const invoke = async ({ prompt }) => {
    const request = JSON.parse(prompt);
    if (request.recent) {
      assert.deepEqual(request.recent.map(({ id }) => id), [source.id]);
      return { data: { items: [
        { sourceId: source.id, quote: statement, topic: "english_vocabulary", attribute: "session_limit", aliases: ["单次时长"] },
        { sourceId: source.id, quote: "虚构的证据不能保存", topic: "unsupported", attribute: "fact" },
      ] } };
    }
    const current = request.records.find(({ content }) => content === statement);
    return { data: { items: [{ obsoleteId: oldRecord.id, currentId: current.id, reason: "correction" }] } };
  };
  assert.equal(await runMemoryJob(db, { invoke, clock }), "extract");
  assert.equal(await db.memoryRecord.count({ where: { userId } }), 2);
  assert.equal(await runMemoryJob(db, { invoke, clock }), null);
  now = new Date(now.getTime() + 6 * 60_000);
  assert.equal(await runMemoryJob(db, { invoke, clock }), "consolidate");
  const active = await db.memoryRecord.findMany({ where: activeMemoryScope(userId, now) });
  assert.deepEqual(active.map(({ content }) => content), [statement]);
  assert.equal(await runMemoryJob(db, { invoke, clock }), null);
});

test("a sourced recap survives the recent window and disappears with its forgotten source", async (t) => {
  const db = await testDatabase(t);
  const { id: userId } = await db.user.create({ data: { id: "recap-user" } });
  const decision = "我们还没决定周六还是周日复习，每次20分钟";
  const source = await db.companionMessage.create({
    data: { userId, role: "user", content: decision, createdAt: new Date("2026-11-01T00:00:00Z") },
  });
  const item = await db.$transaction((tx) => createMemory(tx, {
    userId, sourceIds: [source.id], data: { title: decision, isPinned: true },
  }));
  await db.companionMessage.createMany({
    data: Array.from({ length: 13 }, (_, index) => ({
      userId, role: "user", content: "今天随便聊一聊", createdAt: new Date(Date.UTC(2026, 10, 2, index)),
    })),
  });
  const recap = await proposeMemoryRecap(db, {
    userId,
    invoke: async ({ prompt }) => {
      assert.ok(JSON.parse(prompt).messages.some(({ id }) => id === source.id));
      return { data: { points: [
        { kind: "open", sourceId: source.id, quote: decision },
        { kind: "goal", sourceId: source.id, quote: "来源并没有说过这句" },
      ] } };
    },
  });
  await db.$transaction((tx) => saveMemoryRecap(tx, userId, recap));
  let context = await loadMemoryContext(db, userId);
  assert.deepEqual(context.profile.map(({ id, version }) => [id, version]), [[item.id, 1]]);
  assert.deepEqual(context.recap.map(({ quote }) => quote), [decision]);
  assert.match(renderMemoryContext(context), /未决|还没决定/);
  await db.$transaction((tx) => forgetMemory(tx, { userId, id: item.id }));
  context = await loadMemoryContext(db, userId);
  assert.deepEqual(context, { recap: [], profile: [] });
  assert.deepEqual((await db.memoryRecap.findUnique({ where: { userId } })).points, []);
});

test("confirmed task context is account-scoped and does not become a user preference", async (t) => {
  const db = await testDatabase(t);
  const [owner, other] = await Promise.all(["confirmed-owner", "confirmed-other"].map((id) => db.user.create({ data: { id } })));
  const task = await db.task.create({ data: { userId: owner.id, title: "词汇复习约定" } });
  await db.memoryTaskSignal.create({ data: { userId: owner.id, kind: "confirmed_plan", evidenceId: task.id } });
  assert.deepEqual(await loadRememberedCommitments(db, other.id, "继续上次的计划"), []);
  const commitments = await loadRememberedCommitments(db, owner.id, "继续上次的计划");
  assert.equal(commitments[0].id, task.id);
  assert.match(renderMemoryContext({ commitments }), /不代表用户偏好/);
  assert.equal(await db.memoryRecord.count(), 0);
});

test("a topic summary substitutes compact sourced facts for duplicate prompt text", () => {
  const facts = [
    { id: "limit", title: "每次20分钟", content: "每次20分钟", fact: { topic: "study", subject: "self" }, revisions: [{ version: 3 }] },
    { id: "format", title: "纸质单词卡", content: "纸质单词卡", fact: { topic: "study", subject: "self" } },
  ];
  const topicSummary = buildMemoryTopicSummary(facts);
  assert.deepEqual(topicSummary.entries.map(({ id, version }) => [id, version]), [["limit", 3], ["format", 1]]);
  const plain = renderMemoryContext({ memories: facts });
  const compact = renderMemoryContext({ memories: facts, topicSummary });
  assert.ok(compact.length < plain.length);
  assert.match(compact, /每次20分钟.*纸质单词卡/);
});

test("embedding retrieval uses the current revision and falls back after provider failure", async (t) => {
  const settings = {
    MEMORY_HYBRID_ENABLED: "1", MEMORY_EMBEDDING_URL: "http://127.0.0.1:0/v1/embeddings", MEMORY_EMBEDDING_MODEL: "fixture",
  };
  for (const [key, value] of Object.entries(settings)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const records = [
    { id: "current", embedding: { model: "fixture", version: 2, vector: [5, 0] }, revisions: [{ version: 2 }] },
    { id: "stale", embedding: { model: "fixture", version: 1, vector: [0, 5] }, revisions: [{ version: 2 }] },
  ];
  assert.deepEqual([...await memoryVectorScores(records, "词汇", async () => ({ model: "fixture", values: [1, 0] }))], [["current", 1]]);
  assert.equal((await memoryVectorScores(records, "词汇", async () => { throw new Error("offline"); })).size, 0);
});
