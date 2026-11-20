import test from "node:test";
import assert from "node:assert/strict";
import {
  BUDDY_DEFAULT_PERSONA,
  loadOwnerBuddyPersona,
  pickBuddyPersona,
} from "./buddyPersona.js";

test("每颗搭子有类型默认人格", () => {
  assert.equal(BUDDY_DEFAULT_PERSONA.study, "strict");
  assert.equal(BUDDY_DEFAULT_PERSONA.travel, "gentle");
  assert.equal(BUDDY_DEFAULT_PERSONA.morning, "buddy");
  assert.equal(BUDDY_DEFAULT_PERSONA.running, "buddy");
});

test("用户单独设置优先于搭子默认人格", () => {
  assert.equal(pickBuddyPersona({ persona: "buddy" }, "gentle", "study"), "buddy");
  assert.equal(pickBuddyPersona({}, "gentle", "study"), "strict");
  assert.equal(pickBuddyPersona({}, null, "reading"), "gentle");
});

test("协同空间读取创建者在这颗搭子下的人格", async () => {
  const prisma = {
    userPreference: {
      findUnique: async () => ({
        metadata: {
          _extraFields: {
            persona: "gentle",
            buddy_profiles: { study: { persona: "buddy" }, running: {} },
          },
        },
      }),
    },
  };
  assert.equal(await loadOwnerBuddyPersona({ prisma, userId: "u1", buddyId: "study" }), "buddy");
  assert.equal(await loadOwnerBuddyPersona({ prisma, userId: "u1", buddyId: "running" }), "buddy");
  assert.equal(await loadOwnerBuddyPersona({ prisma, userId: "u1", buddyId: null }), "gentle");
});
