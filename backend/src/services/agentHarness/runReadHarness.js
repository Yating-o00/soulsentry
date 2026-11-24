import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { invokeCapability } from "./capability.js";

const MAX_STEPS = 12;
const RUN_TIMEOUT_MS = 60_000;
const id = z.string().min(1).max(128);
const decisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call"), tool: id, args: z.record(z.unknown()) }),
  z.object({ type: z.literal("ask"), question: z.string().trim().min(1).max(3000), choices: z.array(id).max(20).optional() }),
  z.object({ type: z.literal("propose"), tool: id, args: z.record(z.unknown()), evidenceIds: z.array(id).min(1).max(MAX_STEPS) }),
  z.object({
    type: z.literal("finish"), reply: z.string().trim().min(1).max(3000),
    evidenceIds: z.array(id).min(1).max(MAX_STEPS),
    facts: z.array(z.record(z.unknown())).max(50).optional(),
  }),
]);

function callKey(tool, args) {
  return JSON.stringify([tool, args], (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
    }
    return value;
  });
}

function grounded(decision, observations) {
  const cited = decision.evidenceIds.map((id) => observations.find((entry) => entry.id === id && entry.result.ok));
  if (cited.some((entry) => !entry)) return false;
  const records = cited.flatMap(({ result }) => result.data);
  return (decision.facts ?? []).every((fact) => {
    const entries = Object.entries(fact);
    return entries.length > 0 && records.some((record) => record && typeof record === "object"
      && entries.every(([key, value]) => Object.hasOwn(record, key) && isDeepStrictEqual(record[key], value)));
  });
}

function groundedChoices(choices, observations) {
  if (!choices?.length) return true;
  const observedIds = new Set(observations.flatMap(({ result }) => result.ok ? result.data : []).map((record) => record?.id));
  return choices.every((choice) => observedIds.has(choice));
}

export async function withSignal(operation, signal) {
  signal.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([aborted, Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    })]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function toolFailure(error) {
  const code = String(error?.code ?? "").toUpperCase();
  if (code === "FORBIDDEN" || code === "PRECONDITION_CHANGED") return code;
  if (error?.name === "ZodError") return "INVALID_ARGUMENTS";
  return "TOOL_FAILURE";
}

export function runReadHarness(options) {
  return runHarnessDecision({ ...options, allowProposal: false });
}

/** Writes enter this loop solely as proposals. Applying them requires a separate confirm request. */
export async function runHarnessDecision({ actorId, taskId, input, continuation, capabilities = [], decide, maxSteps = 6, signal, allowProposal = false }) {
  const runId = randomUUID();
  const validTaskId = id.safeParse(taskId).success;
  const currentTaskId = validTaskId ? taskId : randomUUID();
  const trace = [];
  let modelCalls = 0;
  let toolCalls = 0;
  const outcome = (status, details) => ({ taskId: currentTaskId, runId, status, ...details, modelCalls, toolCalls, trace });
  const blocked = (code) => outcome("blocked", { code });
  if (typeof actorId !== "string" || !actorId.trim()) return blocked("UNAUTHENTICATED");
  if (typeof input !== "string" || !input.trim() || (taskId !== undefined && !validTaskId)) return blocked("INVALID_INPUT");
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_STEPS) return blocked("INVALID_STEP_BUDGET");

  const visible = capabilities.filter((capability) => capability.modelInput && (capability.effect === "read"
    || (allowProposal && typeof capability.prepare === "function" && typeof capability.verify === "function")));
  const registry = new Map(visible.map((capability) => [capability.name, capability]));
  if (registry.size !== visible.length) return blocked("DUPLICATE_CAPABILITY");
  const tools = visible.map(({ name, description, effect, modelInput }) => ({
    name, description, input: modelInput, ...(allowProposal ? { effect } : {}),
  }));
  const deadline = AbortSignal.timeout(RUN_TIMEOUT_MS);
  const activeSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const cancelled = () => blocked(activeSignal.reason?.name === "TimeoutError" ? "RUN_TIMEOUT" : "RUN_ABORTED");
  const observations = [];
  const attempted = new Set();

  for (let step = 1; step <= maxSteps; step += 1) {
    let raw;
    try {
      raw = await withSignal(() => {
        modelCalls += 1;
        return decide({ input, continuation: structuredClone(continuation), capabilities: structuredClone(tools), observations: structuredClone(observations), signal: activeSignal });
      }, activeSignal);
    } catch {
      return activeSignal.aborted ? cancelled() : blocked("MODEL_FAILURE");
    }
    if (activeSignal.aborted) return cancelled();
    const parsed = decisionSchema.safeParse(raw);
    if (!parsed.success) return blocked("INVALID_DECISION");
    const decision = parsed.data;

    if (decision.type === "ask") {
      if (!groundedChoices(decision.choices, observations)) return blocked("MISSING_EVIDENCE");
      trace.push({ step, type: "ask" });
      return outcome("awaiting_input", { question: decision.question, choices: decision.choices });
    }
    if (decision.type === "finish") {
      if (!grounded(decision, observations)) return blocked("MISSING_EVIDENCE");
      const evidenceIds = [...new Set(decision.evidenceIds)];
      trace.push({ step, type: "finish", evidenceIds });
      return outcome("completed", { reply: decision.reply, facts: decision.facts, evidenceIds });
    }

    const { tool, args } = decision;
    let key;
    try {
      key = callKey(`${decision.type}:${tool}`, args);
    } catch {
      return blocked("INVALID_DECISION");
    }
    if (attempted.has(key)) return blocked("NO_PROGRESS");
    attempted.add(key);

    let result;
    const capability = registry.get(tool);
    if (!capability || (decision.type === "call" ? capability.effect !== "read" : capability.effect !== "write")) {
      result = { ok: false, code: "UNKNOWN_TOOL" };
    } else {
      try {
        if (decision.type === "propose") {
          const cited = observations.filter((item) => decision.evidenceIds.includes(item.id) && item.result.ok);
          if (cited.length !== new Set(decision.evidenceIds).size) return blocked("MISSING_EVIDENCE");
          const normalized = capability.input.parse(args);
          const preview = await withSignal(() => invokeCapability(capability, normalized, {
            actorId, evidence: structuredClone(cited.flatMap(({ result }) => result.data)),
          }, { signal: activeSignal, phase: "prepare" }), activeSignal);
          trace.push({ step, type: "propose", tool, evidenceIds: decision.evidenceIds });
          return outcome("awaiting_confirmation", { action: { capability: tool, args: normalized }, preview });
        }
        const value = await withSignal(() => {
          toolCalls += 1;
          return invokeCapability(capability, structuredClone(args), { actorId }, { signal: activeSignal });
        }, activeSignal);
        result = { ok: true, data: JSON.parse(JSON.stringify(value)) };
      } catch (error) {
        if (activeSignal.aborted) return cancelled();
        result = { ok: false, code: toolFailure(error) };
      }
    }
    if (activeSignal.aborted) return cancelled();
    const observationId = `obs-${observations.length + 1}`;
    observations.push({ id: observationId, tool, args, result });
    trace.push({ step, type: "call", tool, observationId, ...(result.ok ? {} : { code: result.code }) });
  }
  return blocked("BUDGET_EXHAUSTED");
}
