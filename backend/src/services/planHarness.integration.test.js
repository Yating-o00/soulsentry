import test from "node:test";
import assert from "node:assert/strict";
import { planCommitmentWithKimi } from "./planCommitment.js";

test("planner expands a four-session draft, feeds validation errors to one repair, and returns three detailed workouts", async () => {
  const prompts = [];
  const invoke = async ({ prompt }) => {
    prompts.push(prompt);
    return { data: {
      parent: { title: "哑铃练背", description: "每周训练", category: "health", priority: "medium" },
      patterns: [{ plan_group: "练背", session_type: "session", applies_to: prompts.length === 1 ? "周一,周二,周三,周四" : "周一,周三,周五", start_time: "10:00", duration_minutes: 45, title: "哑铃划船", description: "哑铃划船3组12次" }]
    } };
  };
  const result = await planCommitmentWithKimi({ goal: "哑铃练背训练", horizonDays: 7, dailyMinutes: 45, constraints: { sessionsPerWeek: 3, sessionMinutes: 45, training: true }, invoke });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /需要 3 次/);
  assert.equal(result.children.filter((child) => child.session_type === "session").length, 3);
  assert.ok(result.children.filter((child) => child.session_type === "session").every((child) => child.duration_minutes === 45 && child.description.includes("3组12次")));
});

test("planner does not return an invalid study proposal after the repair is exhausted", async () => {
  let calls = 0;
  const invoke = async () => {
    calls += 1;
    return { data: { parent: { title: "学习", description: "复习" }, patterns: [{ plan_group: "学习", session_type: "session", applies_to: "daily", start_time: "10:00", duration_minutes: 30, title: "复习", description: "练习30分钟" }] } };
  };
  await assert.rejects(planCommitmentWithKimi({ goal: "英语学习", horizonDays: 7, dailyMinutes: 30, constraints: { sessionsPerWeek: 3, sessionMinutes: 30 }, invoke }), /需要 3 次/);
  assert.equal(calls, 2);
});

test("planner propagates a provider outage instead of returning a fallback proposal", async () => {
  await assert.rejects(planCommitmentWithKimi({
    goal: "英语学习", horizonDays: 7, dailyMinutes: 30,
    invoke: async () => { throw new Error("provider unavailable"); }
  }), /AI 服务暂不可用/);
});

test("planner supports a two-month project plan without truncating at 30 days", async () => {
  const invoke = async () => ({
    data: {
      parent: { title: "产品上新", description: "60 天推进上新", category: "work", priority: "high" },
      patterns: [{
        plan_group: "上新", session_type: "session", applies_to: "daily", start_time: "10:00",
        duration_minutes: 45, title: "当天推进", description: "完成当天可交付的一步",
      }],
    },
  });
  const result = await planCommitmentWithKimi({ goal: "产品上新", horizonDays: 60, dailyMinutes: 45, invoke });
  const dates = new Set(result.children.map((child) => child.date));
  assert.ok(result.children.length >= 50, `expected a long plan, got ${result.children.length}`);
  assert.ok(dates.size >= 50);
});
