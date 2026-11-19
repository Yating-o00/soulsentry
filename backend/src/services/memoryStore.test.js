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
