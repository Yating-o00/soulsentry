import assert from "node:assert/strict";
import { test } from "node:test";
import { generalCases } from "./general-cases.js";
import { runGeneralCase } from "./general-runner.js";
import { createReadPilotDriver } from "./read-pilot.js";

function fixture(id) {
  return generalCases.find((entry) => entry.id === id);
}

const call = (tool, args) => ({ type: "call", tool, args });

function fakeProvider(...decisions) {
  const requests = [];
  return {
    requests,
    async invoke({ prompt }) {
      const input = JSON.parse(prompt);
      const decide = decisions[requests.length];
      requests.push(input);
      assert.ok(decide, "unexpected model call");
      return { data: decide(input) };
    },
  };
}

function requirePass(report) {
  assert.deepEqual(report.issues, []);
  assert.equal(report.pass, true);
  assert.equal(report.steps[0].commits, 0);
  return report.steps[0];
}

test("read pilot answers the grounded-record fixture with only the actor's evidence", async () => {
  const provider = fakeProvider(
    () => call("find_records", { query: "周报 A" }),
    ({ observations: [observation] }) => {
      const [{ id, status }] = observation.result.data;
      return { type: "finish", reply: "周报 A 仍开着。", facts: [{ id, status }], evidenceIds: [observation.id] };
    },
  );

  const report = await runGeneralCase(fixture("choose_grounded_read"), createReadPilotDriver(provider));
  const step = requirePass(report);
  assert.deepEqual(step.calls.map(({ name }) => name), ["find_records"]);
  assert.equal(provider.requests.length, 2);
  const [first, afterRead] = provider.requests;
  assert.equal(first.input, step.input.text);
  assert.deepEqual(first.capabilities.map(({ name }) => name).sort(), ["find_collections", "find_records"]);
  assert.deepEqual(first.observations, []);
  assert.deepEqual(afterRead.observations[0].result.data.map(({ id, owner }) => ({ id, owner })), [
    { id: "report-a", owner: step.input.actorId },
  ]);
  assert.doesNotMatch(JSON.stringify(afterRead), /other-report|other-inbox/);
});

test("read pilot chains collection lookup from a tool result without asking about formatting", async () => {
  const provider = fakeProvider(
    () => call("find_records", { query: "周报 B" }),
    ({ observations: [record] }) => call("find_collections", { id: record.result.data[0].collectionId }),
    ({ observations: [record, collection] }) => {
      const [{ id, collectionId }] = record.result.data;
      return {
        type: "finish",
        reply: `在${collection.result.data[0].name}。`,
        facts: [{ id, collectionId }],
        evidenceIds: [record.id, collection.id],
      };
    },
  );

  const report = await runGeneralCase(fixture("soft_preference_no_extra_turn"), createReadPilotDriver(provider));
  const step = requirePass(report);
  assert.deepEqual(step.calls.map(({ name }) => name), ["find_records", "find_collections"]);
  assert.deepEqual(step.calls[1].args, { id: "inbox" });
  assert.equal(step.outcomes[0].reply, "在收件箱。");
  assert.equal(step.outcomes[0].question, undefined);
  assert.equal(provider.requests.length, 3);
});

test("read pilot exits with a clarification when two scoped records fit", async () => {
  const { steps: [firstStep] } = fixture("clarify_and_resume");
  const provider = fakeProvider(
    () => call("find_records", { query: "周报" }),
    ({ observations: [record] }) => ({
      type: "ask",
      question: "你想把周报 A 还是周报 B 标记为完成？",
      choices: record.result.data.filter(({ status }) => status === "open").map(({ id }) => id),
    }),
  );

  const report = await runGeneralCase({ id: "clarify_and_resume:first_turn", steps: [firstStep] }, createReadPilotDriver(provider));
  const step = requirePass(report);
  assert.equal(step.outcomes[0].status, "awaiting_input");
  assert.deepEqual(step.calls.map(({ name }) => name), ["find_records"]);
  assert.equal(provider.requests.length, 2);
});
