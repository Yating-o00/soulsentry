import test from "node:test";
import assert from "node:assert/strict";
import { retrievePersonalMemories } from "./personalMemory.js";

test("recall scopes the query to the user and matches a related fitness request", async () => {
  const prisma = { memoryRecord: { findMany: async (options) => {
    assert.equal(options.where.userId, "user-a");
    return [
      { id: "1", title: "居家训练", content: "只有哑铃", tags: [] },
      { id: "2", title: "饮食偏好", content: "喜欢米饭", tags: [] },
    ];
  } } };
  const results = await retrievePersonalMemories({ prisma, userId: "user-a", query: "帮我安排不需要健身房器械的锻炼" });
  assert.deepEqual(results.map((record) => record.id), ["1"]);
  assert.deepEqual(await retrievePersonalMemories({ prisma, userId: "user-a", query: "推荐午餐" }), []);
});

test("recall matches words outside fitness and omits unrelated memory", async () => {
  const prisma = { memoryRecord: { findMany: async () => [
    { id: "food", title: "饮食", content: "早餐喜欢燕麦", tags: [] },
    { id: "trip", title: "旅行", content: "喜欢坐火车", tags: [] },
  ] } };
  const results = await retrievePersonalMemories({ prisma, userId: "user-a", query: "给我推荐早餐" });
  assert.deepEqual(results.map((record) => record.id), ["food"]);
});

test("standing instructions are included even when the topic differs", async () => {
  const prisma = { memoryRecord: { findMany: async () => [
    { id: "instruction", title: "以后用中文回答", content: "以后用中文回答", memoryType: "instruction", tags: [] },
    { id: "unrelated", title: "早餐", content: "喜欢燕麦", memoryType: "preference", tags: [] },
  ] } };
  const results = await retrievePersonalMemories({ prisma, userId: "user-a", query: "旅行计划" });
  assert.deepEqual(results.map((record) => record.id), ["instruction"]);
});
