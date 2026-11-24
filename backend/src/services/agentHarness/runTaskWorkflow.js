import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { invokeCapability } from "./capability.js";
import { runHarnessDecision, withSignal } from "./runReadHarness.js";

const CLAIM_EXPIRY_MS = 15_000;
const REPLAY_WAIT_MS = 1_000;
const WRITE_TIMEOUT_MS = 6_000;

function controlledError(error) {
  const code = String(error?.code ?? "").toLowerCase();
  return ["forbidden", "precondition_changed", "invalid_input"].includes(code) ? code : null;
}

function receiptOutcome(receipt, operationId) {
  return receipt ? { status: "completed", operationId, receipt } : { status: "unverified", operationId };
}

async function verify(capability, args, context) {
  try {
    const signal = AbortSignal.timeout(WRITE_TIMEOUT_MS);
    const receipt = await withSignal(() => invokeCapability(capability, args, context, { phase: "verify", signal }), signal);
    return receipt?.operationId === context.operationId ? receipt : null;
  } catch {
    return null;
  }
}

async function applyAndVerify(capability, args, context) {
  try {
    const signal = AbortSignal.timeout(WRITE_TIMEOUT_MS);
    await withSignal(() => invokeCapability(capability, args, context, { signal }), signal);
  } catch (error) {
    const code = controlledError(error);
    if (code) return { status: "blocked", code };
    // The write may have committed before the caller lost the response.
  }
  return receiptOutcome(await verify(capability, args, context), context.operationId);
}

export function createTaskWorkflow({ store, capabilities, decide, now = Date.now }) {
  async function plan(input, task) {
    const state = task.data;
    const continuation = input.type === "reply" ? {
      request: state.request, replies: state.replies, question: state.question, choices: state.choices,
      proposal: state.proposal?.actions,
    } : undefined;
    const decision = await runHarnessDecision({
      actorId: input.actorId, taskId: task.id, input: input.text, continuation, capabilities, decide, allowProposal: true,
    });
    const { action, preview, ...outcome } = decision;
    const proposal = action ? { id: task.id, version: (state.proposal?.version ?? 0) + 1, actions: [action], preview } : undefined;
    const next = {
      request: state.request,
      replies: input.type === "reply" ? [...(state.replies ?? []), input.text].slice(-8) : [],
      status: outcome.status, question: outcome.question, choices: outcome.choices,
      proposal: proposal ?? state.proposal,
    };
    if (!await store.replace(task, next)) return { taskId: task.id, runId: outcome.runId, status: "blocked", code: "task_changed" };
    return { ...outcome, ...(proposal ? { proposal } : {}) };
  }

  async function settle(task, result) {
    return store.replace(task, { ...task.data, status: result.status, result });
  }

  async function confirm(input, task, answer) {
    const expected = task.data.proposal;
    if (!expected || expected.id !== input.proposal?.id || expected.version !== input.proposal.version) {
      return answer({ status: "blocked", code: "stale_proposal" });
    }
    const { capability: name, args } = expected.actions[0];
    const capability = capabilities.find((entry) => entry.name === name && entry.effect === "write" && entry.verify);
    if (!capability) return answer({ status: "blocked", code: "capability_unavailable" });
    const context = { actorId: input.actorId, operationId: `harness:${expected.id}:${expected.version}` };
    const deadline = performance.now() + REPLAY_WAIT_MS;
    while (task?.data.proposal?.version === expected.version) {
      const state = task.data;
      if (state.result?.status === "completed" || state.result?.status === "blocked") return answer(state.result);
      if (state.result?.status === "unverified" || (state.status === "applying" && now() - state.claimedAt >= CLAIM_EXPIRY_MS)) {
        const result = receiptOutcome(await verify(capability, args, context), context.operationId);
        await settle(task, result);
        return answer(result);
      }
      if (state.status === "awaiting_confirmation") {
        const claimed = await store.replace(task, { ...state, status: "applying", claimedAt: now() });
        if (claimed) {
          const result = await applyAndVerify(capability, args, context);
          await settle(claimed, result);
          return answer(result);
        }
      } else if (state.status === "applying") {
        if (performance.now() >= deadline) return answer({ status: "unverified", operationId: context.operationId });
        await delay(20);
      } else {
        return answer({ status: "blocked", code: "stale_proposal" });
      }
      task = await store.get(task.id, input.actorId);
    }
    return answer({ status: "blocked", code: "stale_proposal" });
  }

  return async function run(input) {
    const answer = (result) => ({ taskId: input.taskId, runId: randomUUID(), ...result });
    if (!input.actorId) return answer({ status: "blocked", code: "forbidden" });
    if (input.type === "message") {
      const task = await store.create({ id: randomUUID(), actorId: input.actorId, data: { request: input.text, status: "planning" } });
      return plan(input, task);
    }
    const task = await store.get(input.taskId, input.actorId);
    if (!task) return answer({ status: "blocked", code: "forbidden" });
    if (input.type === "confirm") return confirm(input, task, answer);
    if (input.type !== "reply" || task.data.status === "applying" || ["completed", "unverified"].includes(task.data.status)) {
      return answer({ status: "blocked", code: "task_changed" });
    }
    const reserved = await store.replace(task, { ...task.data, status: "planning", result: undefined });
    return reserved ? plan(input, reserved) : answer({ status: "blocked", code: "task_changed" });
  };
}
