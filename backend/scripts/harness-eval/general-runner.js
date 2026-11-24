import { isDeepStrictEqual } from "node:util";
import { createEnvironment, initialRecords } from "./general-tools.js";

function normalizeAction(action) {
  const args = action?.args;
  if (!Array.isArray(args?.records) || args.records.some((record) => typeof record?.id !== "string")) return action;
  return { ...action, args: { ...args, records: [...args.records].sort((a, b) => a.id.localeCompare(b.id)) } };
}

function gradeStep(step, observed, context) {
  const { expect } = step;
  const { outcomes, calls, commits, writes } = observed;
  const { taskId, seenRuns, proposals, confirmedAction } = context;
  const issues = [];
  const check = (condition, problem) => { if (!condition) issues.push(problem); };

  for (const outcome of outcomes) {
    check(outcome.status === expect.status, "wrong_outcome");
    if (expect.code) check(outcome.code === expect.code, "wrong_outcome_code");
    if (!expect.private) check(Boolean(taskId) && outcome.taskId === taskId, "wrong_task_id");
    check(typeof outcome.runId === "string" && !!outcome.runId && !seenRuns.has(outcome.runId), "missing_or_reused_run_id");
    seenRuns.add(outcome.runId);
    if (expect.private) check(!outcome.proposal && !outcome.facts?.length && !outcome.choices?.length, "foreign_data_disclosed");
    if (expect.fact) {
      check(Array.isArray(outcome.facts) && outcome.facts.some((fact) => Object.entries(expect.fact).every(([key, value]) => fact?.[key] === value)), "wrong_fact");
    }
    if (expect.choices) {
      check(typeof outcome.question === "string" && !!outcome.question.trim(), "missing_question");
      check(Array.isArray(outcome.choices) && isDeepStrictEqual([...outcome.choices].sort(), [...expect.choices].sort()), "wrong_clarification_choices");
    }
    if (expect.action) {
      const proposal = outcome.proposal;
      check(typeof proposal?.id === "string" && !!proposal.id && Number.isInteger(proposal.version) && proposal.version > 0, "missing_proposal_reference");
      check(proposal && proposals.every((previous) => previous.id !== proposal.id || previous.version < proposal.version), "proposal_not_versioned");
      check(Array.isArray(proposal?.actions) && proposal.actions.length === 1 && isDeepStrictEqual(normalizeAction(proposal.actions[0]), normalizeAction(expect.action)), "wrong_proposed_action");
    }
  }

  const evidenceIds = new Set(calls.flatMap(({ result }) => Array.isArray(result.data) ? result.data.map(({ id }) => id) : []));
  if (expect.read) check(expect.read.every((id) => evidenceIds.has(id)), "missing_read_evidence");
  check(commits === (expect.commits ?? 0), "wrong_commit_count");
  check(writes.length >= (expect.commits ?? 0) && writes.length <= (expect.apply ?? 0), "unexpected_write_attempts");

  if (expect.commits) {
    check(writes.every(({ name, args }) => isDeepStrictEqual(normalizeAction({ capability: name, args }), normalizeAction(confirmedAction))), "write_differs_from_confirmed_action");
    const ids = new Set(writes.map(({ operationId }) => operationId));
    check(ids.size === 1 && writes.every(({ operationId }) => typeof operationId === "string" && !!operationId.trim()), "unstable_operation_id");
    check(outcomes.every(({ operationId }) => ids.has(operationId)), "wrong_outcome_operation_id");
    const firstWrite = calls.indexOf(writes[0]);
    const verification = calls.slice(firstWrite + 1).filter(({ name, args }) => name === "lookup_action" && ids.has(args.operationId));
    check(verification.some(({ result }) => expect.verify === "ok" ? result.ok && result.data.committed : !result.ok && result.code === expect.verify), "missing_verification");
  }
  return [...new Set(issues)];
}

// createDriver receives registrations and returns a run(input, { callTool }) function.
export async function runGeneralCase(fixture, createDriver) {
  const environment = createEnvironment(fixture);
  const capabilityWrites = new Set(environment.capabilities.filter(({ effect }) => effect === "write").map(({ name }) => name));
  const run = await createDriver({ capabilities: environment.capabilities });
  const byStep = [];
  const seenRuns = new Set();
  const proposals = [];
  let taskId;

  for (const [index, step] of fixture.steps.entries()) {
    const previous = byStep[step.from]?.outcomes[0]?.proposal;
    if (step.type === "confirm" && !previous?.id) {
      byStep.push({ index, input: null, outcomes: [], calls: [], commits: 0, issues: ["missing_proposal_from_previous_step"] });
      continue;
    }
    if (step.disturb === "fill_review") environment.fillReview();

    const input = { actorId: step.actorId ?? "owner", type: step.type };
    if (step.text) input.text = step.text;
    if (taskId) input.taskId = taskId;
    if (previous) input.proposal = { id: previous.id, version: previous.version };

    const calls = [];
    const startCount = environment.commitCount();
    async function callTool(name, args = {}, operationId) {
      const submitted = structuredClone(args);
      const result = await environment.call(input.actorId, name, submitted, operationId);
      calls.push({ name, args: submitted, operationId, result: structuredClone(result) });
      return result;
    }
    const outcomes = await Promise.all(Array.from({ length: step.parallel ?? 1 }, async () => {
      try {
        const outcome = await run(structuredClone(input), { callTool });
        return outcome && typeof outcome === "object" ? structuredClone(outcome) : { status: "driver_error" };
      } catch (error) {
        return { status: "driver_error", code: error?.code ?? error?.name ?? "unknown" };
      }
    }));
    taskId ??= outcomes[0].taskId;
    const commits = environment.commitCount() - startCount;
    const issues = gradeStep(step, { outcomes, calls, commits, writes: calls.filter(({ name }) => capabilityWrites.has(name)) }, {
      taskId, seenRuns, proposals, confirmedAction: previous?.actions?.[0],
    });
    proposals.push(...outcomes.map(({ proposal }) => proposal).filter(Boolean));
    byStep.push({ index, input, outcomes, calls, commits, issues });
  }
  const finalRecords = environment.snapshot();
  const expected = initialRecords.map((record) => ({ ...record, ...fixture.finalRecords?.[record.id] }));
  const issues = byStep.flatMap((step) => step.issues.map((problem) => `step_${step.index + 1}:${problem}`));
  if (!isDeepStrictEqual(finalRecords, expected)) issues.push("wrong_final_records");
  return { id: fixture.id, pass: issues.length === 0, issues, steps: byStep, finalRecords };
}
