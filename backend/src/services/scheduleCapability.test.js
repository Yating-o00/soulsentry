import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSchedule, confirmSchedule } from "./scheduleCapability.js";

const actorId = "owner";
const plan = {
  parent: { title: "阅读计划" },
  children: [{
    date: "2026-11-16", start_time: "10:00", end_time: "10:25", duration_minutes: 25,
    title: "读书", session_type: "session",
  }],
};
const constraints = { startDate: "2026-11-16", horizonDays: 7, checkWindows: true, busy: [] };

test("preview reuses observed windows and confirmation checks fresh, owned windows", async () => {
  const calls = [];
  const db = { task: { async findMany(query) {
    calls.push(query);
    return [{ reminderTime: new Date("2026-11-16T10:10:00+08:00"), endTime: new Date("2026-11-16T10:50:00+08:00") }];
  } } };
  const preview = await checkSchedule({ plan, constraints }, { actorId, db });
  assert.deepEqual(preview, {
    snapshot: { startDate: "2026-11-16", horizonDays: 7, checkWindows: true },
    errors: [],
  });
  assert.equal(calls.length, 0);

  const confirmation = await checkSchedule({ plan, constraints, refreshBusy: true }, { actorId, db });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.userId, actorId);
  assert.match(confirmation.errors[0], /^BUSY_CONFLICT/);
  assert.deepEqual(confirmation.snapshot, preview.snapshot);
  assert.deepEqual(constraints.busy, []);
});

test("confirmation only hands the caller's stored plan to the transaction", async () => {
  const draft = { extracted: { plan }, constraints };
  const db = { companionMessage: { async findFirst({ where }) {
    if (where.id === "stored" && where.userId === actorId && where.role === "assistant") {
      return { id: where.id, meta: { planProposal: true, planDraft: draft } };
    }
    return null;
  } } };
  const saves = [];
  const savePlan = async (args) => {
    saves.push(args);
    return { status: 201 };
  };
  assert.equal(await confirmSchedule("stored", { actorId: "other", db, savePlan }), null);
  assert.equal(saves.length, 0);

  assert.deepEqual(await confirmSchedule("stored", { actorId, db, savePlan }), { status: 201 });
  assert.equal(saves[0].proposalKey, "companion:stored");
  assert.equal(saves[0].memoryProposalId, "stored");
  assert.deepEqual(saves[0].draft, draft);
  assert.equal(saves[0].parent.title, "阅读计划");
  assert.equal(saves[0].children[0].reminder_time, "2026-11-16T10:00:00+08:00");
});
