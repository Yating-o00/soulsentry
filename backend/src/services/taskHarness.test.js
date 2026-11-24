import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlanningRequest, runTaskHarness, validateScheduledSessions } from "./taskHarness.js";
import { trainingClarification } from "./trainingWorkflow.js";

function plan(count, minutes = 45) {
  return { children: Array.from({ length: count }, (_, i) => ({ date: `2026-11-${String(16 + i).padStart(2, "0")}`, session_type: "session", duration_minutes: minutes })) };
}

test("repairs an over-scheduled training plan exactly once", async () => {
  const prompts = [];
  const outcome = await runTaskHarness({
    draft: async (input) => { prompts.push(input); return plan(input.attempt === 0 ? 4 : 3); },
    validate: (draft) => validateScheduledSessions(draft, { sessionsPerWeek: 3, sessionMinutes: 45 }),
  });
  assert.equal(outcome.status, "ready");
  assert.equal(outcome.attempts, 2);
  assert.match(prompts[1].errors[0], /需要 3 次/);
});

test("rejects an invalid study plan after one repair", async () => {
  let calls = 0;
  const outcome = await runTaskHarness({
    draft: async () => { calls += 1; return plan(3, 20); },
    validate: (draft) => validateScheduledSessions(draft, { sessionsPerWeek: 3, sessionMinutes: 30 }),
  });
  assert.equal(outcome.status, "invalid");
  assert.equal(calls, 2);
});

test("surfaces provider failures without manufacturing a plan", async () => {
  const outcome = await runTaskHarness({ draft: async () => { throw new Error("offline"); }, validate: () => [] });
  assert.equal(outcome.reason, "provider_failure");
  assert.equal(outcome.result, undefined);
});

test("asks about training context only when it is missing", () => {
  assert.match(trainingClarification({ goal: "背部力量训练", context: "一周三次，每次45分钟" }), /器械.*经验/);
  assert.match(trainingClarification({ goal: "背部力量训练", context: "我有哑铃" }), /经验/);
  assert.equal(trainingClarification({ goal: "背部力量训练", context: "新手，在家用哑铃" }), null);
  assert.equal(trainingClarification({ goal: "准备英语考试", context: "一周三次" }), null);
  assert.equal(trainingClarification({ goal: "英语口语训练", context: "一周三次" }), null);
});

test("distinguishes recovery from detailed workout sessions", () => {
  const draft = plan(3);
  draft.children.forEach((session) => { session.description = "哑铃划船3组12次"; });
  draft.children.push({ date: "2026-11-19", session_type: "recovery", duration_minutes: 15, description: "散步" });
  assert.deepEqual(validateScheduledSessions(draft, { sessionsPerWeek: 3, sessionMinutes: 45, training: true }), []);
  draft.children[0].description = "背部锻炼";
  assert.match(validateScheduledSessions(draft, { training: true })[0], /组数/);
});

test("checks each complete week separately in a multiweek schedule", () => {
  const first = plan(3).children;
  const second = first.map((child) => ({ ...child, date: `2026-11-${Number(child.date.slice(-2)) + 7}` }));
  const constraints = { sessionsPerWeek: 3, sessionMinutes: 45, horizonDays: 14, startDate: "2026-11-16" };
  assert.deepEqual(validateScheduledSessions({ children: [...first, ...second] }, constraints), []);
  assert.match(validateScheduledSessions({ children: [...first, ...second.slice(1)] }, constraints)[0], /第 2 周/);
});

test("accepts a model default duration only for work/project plans", () => {
  const project = resolvePlanningRequest(
    { goal: "一周产品上新计划", horizon_days: 7, daily_minutes: 45 },
    ["帮我规划一周的产品上新计划"],
    []
  );
  assert.equal(project.clarification, null);
  const study = resolvePlanningRequest(
    { goal: "英语词汇复习", horizon_days: 7, daily_minutes: 20 },
    ["帮我规划一周英语词汇复习，每周三次"],
    []
  );
  assert.equal(study.clarification?.field, "daily_minutes");
});
