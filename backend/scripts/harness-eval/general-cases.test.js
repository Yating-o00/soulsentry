import assert from "node:assert/strict";
import { test } from "node:test";
import { generalCases } from "./general-cases.js";
import { runGeneralCase } from "./general-runner.js";

// Scripted transcripts exercise the evaluator and its state, independently of a model or runtime.
const action = (id, status) => ({ capability: "set_status", args: { id, status, version: 1 } });
const closeA = action("report-a", "done");
const closeB = action("report-b", "done");
const pauseA = action("report-a", "paused");
const move = (target, targetVersion = 1) => ({ capability: "move_records", args: {
  records: [{ id: "report-b", version: 1 }, { id: "report-a", version: 1 }], target, targetVersion,
} });
const proposal = (action, version = 1) => ({
  status: "awaiting_confirmation", proposal: { id: "preview", version, actions: [action] },
});
const blocked = (code) => () => ({ status: "blocked", code });
const readA = async (call) => call("find_records", { query: "周报 A" });
const readB = async (call) => call("find_records", { query: "周报 B" });
const readBatch = async (call) => {
  await call("find_records", { collectionId: "inbox" });
  await call("find_collections", { id: "review" });
};
const draftClose = async (call) => {
  await readA(call);
  return proposal(closeA);
};
const draftMove = async (call) => {
  await readBatch(call);
  return proposal(move("review"));
};
const confirm = ({ capability, args }, { verify = true, retry = false, status = "completed" } = {}) => async (call, input) => {
  const operationId = `write:${input.proposal.id}:${input.proposal.version}`;
  await call(capability, args, operationId);
  if (retry) await call(capability, args, operationId);
  if (verify) await call("lookup_action", { operationId });
  return { status, operationId };
};

const transcripts = {
  choose_grounded_read: [async (call) => {
    await readA(call);
    return { status: "completed", facts: [{ id: "report-a", status: "open" }] };
  }],
  clarify_and_resume: [async (call) => {
    await call("find_records", { query: "周报" });
    return { status: "awaiting_input", question: "你说的是周报 A 还是 B？", choices: ["report-a", "report-b"] };
  }, () => proposal(closeB), confirm(closeB)],
  soft_preference_no_extra_turn: [async (call) => {
    await readB(call);
    await call("find_collections", { id: "inbox" });
    return { status: "completed", facts: [{ id: "report-b", collectionId: "inbox" }] };
  }],
  superseded_proposal: [draftClose, () => proposal(pauseA, 2), blocked("stale_proposal"), confirm(pauseA)],
  concurrent_confirmation: [draftClose, confirm(closeA), confirm(closeA)],
  foreign_confirmation: [draftClose, blocked("forbidden"), confirm(closeA)],
  holdout_batch_read_then_write: [draftMove, confirm(move("review"))],
  timeout_after_commit: [draftClose, confirm(closeA)],
  unavailable_verification: [draftClose, confirm(closeA, { status: "unverified" })],
  holdout_batch_with_capacity_change: [draftMove, async (call) => {
    await call("find_collections", { id: "review" });
    return { status: "blocked", code: "precondition_changed" };
  }, async (call) => {
    await call("find_collections", { id: "backup" });
    return proposal(move("backup", 2), 2);
  }, confirm(move("backup", 2))],
};

function scriptedDriver(steps) {
  return () => {
    let index = 0;
    return async (input, { callTool }) => {
      const current = index++;
      const outcome = await steps[current](callTool, input);
      return { taskId: input.taskId ?? "synthetic-task", runId: `run-${current + 1}`, ...outcome };
    };
  };
}

function run(id, steps = transcripts[id]) {
  return runGeneralCase(generalCases.find((fixture) => fixture.id === id), scriptedDriver(steps));
}

test("the benchmark contains ten distinct fixtures, including two holdouts", () => {
  assert.equal(new Set(generalCases.map(({ id }) => id)).size, 10);
  assert.equal(generalCases.length, 10);
  assert.equal(generalCases.filter(({ holdout }) => holdout).length, 2);
});

for (const { id } of generalCases) {
  test(`general harness grader accepts a valid scripted trial: ${id}`, async () => {
    const report = await run(id);
    assert.deepEqual(report.issues, []);
    assert.equal(report.pass, true);
  });
}

test("a correct-looking read answer with only decoy evidence fails", async () => {
  const report = await run("choose_grounded_read", [async (call) => {
    await call("find_collections", { query: "周报 A" });
    return { status: "completed", facts: [{ id: "report-a", status: "open" }] };
  }]);
  assert.deepEqual(report.issues, ["step_1:missing_read_evidence"]);
});

test("resuming with the old execution ID fails even when the right row gets written", async () => {
  const [request, , approval] = transcripts.clarify_and_resume;
  const report = await run("clarify_and_resume", [request, () => ({ ...proposal(closeB), runId: "run-1" }), approval]);
  assert.deepEqual(report.issues, ["step_2:missing_or_reused_run_id"]);
});

test("a denied foreign confirmation still fails if it attempts a write", async () => {
  const report = await run("foreign_confirmation", [draftClose, async (call) => {
    await call(closeA.capability, closeA.args, "unauthorized");
    return { status: "blocked", code: "forbidden" };
  }, confirm(closeA)]);
  assert.deepEqual(report.issues, ["step_2:unexpected_write_attempts"]);
});

test("a blind retry after timeout fails despite tool-level idempotency", async () => {
  const report = await run("timeout_after_commit", [draftClose, confirm(closeA, { retry: true })]);
  assert.deepEqual(report.issues, ["step_2:unexpected_write_attempts"]);
  assert.equal(report.steps[1].commits, 1);
});

test("claiming success while verification is unavailable fails", async () => {
  const report = await run("unavailable_verification", [draftClose, confirm(closeA, { verify: false })]);
  assert.deepEqual(report.issues, ["step_2:wrong_outcome", "step_2:missing_verification"]);
});

test("a partial batch must fail even if the candidate reports that it was blocked", async () => {
  const [request, , alternative, approval] = transcripts.holdout_batch_with_capacity_change;
  const report = await run("holdout_batch_with_capacity_change", [request, async (call) => {
    await call("find_collections", { id: "review" });
    await call("move_records", { records: [{ id: "report-a", version: 1 }], target: "review", targetVersion: 2 }, "partial");
    return { status: "blocked", code: "precondition_changed" };
  }, alternative, approval]);
  assert.ok(report.issues.includes("step_2:wrong_commit_count"));
  assert.ok(report.issues.includes("wrong_final_records"));
});
