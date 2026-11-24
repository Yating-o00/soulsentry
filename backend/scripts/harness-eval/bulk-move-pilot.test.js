import assert from "node:assert/strict";
import { test } from "node:test";
import { generalCases } from "./general-cases.js";
import { runGeneralCase } from "./general-runner.js";
import { createEnvironment } from "./general-tools.js";
import { createBulkMovePilotDriver } from "./bulk-move-pilot.js";

function decide({ input, observations }) {
  const destination = input.includes("备用箱") ? "备用箱" : "评审箱";
  if (observations.length === 0) return { type: "call", tool: "find_records", args: { collectionId: "inbox", query: "周报" } };
  if (observations.length === 1) return { type: "call", tool: "find_collections", args: { query: destination } };
  const [recordSet, collectionSet] = observations;
  const [target] = collectionSet.result.data;
  return { type: "propose", tool: "move_records", args: {
    records: recordSet.result.data.map(({ id, version }) => ({ id, version })), target: target.id, targetVersion: target.version,
  }, evidenceIds: observations.map(({ id }) => id) };
}

const driver = createBulkMovePilotDriver({ decide });

for (const fixture of generalCases.filter(({ holdout }) => holdout)) {
  test(`M4 holdout through the unchanged workflow: ${fixture.id}`, async () => {
    const report = await runGeneralCase(fixture, driver);
    assert.deepEqual(report.issues, []);
    assert.equal(report.steps[0].commits, 0);
    assert.equal(report.steps.at(-1).commits, 1);
  });
}

test("capacity lost after the last validation leaves the entire batch untouched", async () => {
  const environment = createEnvironment({ holdout: true });
  const run = driver({ capabilities: environment.capabilities });
  let writeAttempts = 0;
  const callTool = (name, args, operationId) => {
    if (name === "move_records") {
      writeAttempts += 1;
      environment.fillReview();
    }
    return environment.call("owner", name, args, operationId);
  };

  const start = await run({ actorId: "owner", type: "message", text: "把收件箱的两条周报一起搬到评审箱，先确认。" }, { callTool });
  assert.equal(start.status, "awaiting_confirmation");
  assert.equal(writeAttempts, 0);
  const { id, version } = start.proposal;
  const confirm = { actorId: "owner", type: "confirm", taskId: start.taskId, proposal: { id, version } };
  const first = await run(confirm, { callTool });
  const replay = await run(confirm, { callTool });
  assert.equal(first.code, "precondition_changed");
  assert.equal(replay.code, "precondition_changed");
  assert.equal(writeAttempts, 1);
  assert.equal(environment.commitCount(), 0);
  assert.deepEqual(environment.snapshot().filter(({ id }) => id.startsWith("report-")).map(({ collectionId, version }) => ({ collectionId, version })), [
    { collectionId: "inbox", version: 1 }, { collectionId: "inbox", version: 1 },
  ]);
});
