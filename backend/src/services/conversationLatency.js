import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requestTrace = Symbol("conversationLatency");
const activeTrace = new AsyncLocalStorage();
const DAY_MS = 86_400_000;
export const RETENTION_DAYS = 30;

export function retentionStart(now = Date.now()) {
  return new Date(now - RETENTION_DAYS * DAY_MS);
}

export function pruneConversationLatency(store, now = Date.now()) {
  return store.deleteMany({ where: { startedAt: { lt: retentionStart(now) } } });
}

export function startConversationLatencyCleanup(store) {
  const prune = () => pruneConversationLatency(store)
    .catch((error) => console.warn("[conversationLatency] retention cleanup failed", error?.code));
  void prune();
  setInterval(prune, DAY_MS).unref();
}

export function captureConversationLatency(save, { clock = () => performance.now(), wallClock = () => Date.now() } = {}) {
  return (req, res, next) => {
    const trace = { origin: clock(), startedAt: new Date(wallClock()), clock, spans: [] };
    req[requestTrace] = trace;

    trace.record = (interrupted, endedAt = clock()) => {
      if (trace.closed) return;
      if (!trace.entry) {
        if (interrupted) trace.disconnectedAt = endedAt;
        return;
      }
      trace.closed = true;
      const totalMs = Math.round(endedAt - trace.origin);
      const spans = trace.spans.map(({ endMs, ...span }) => ({
        ...span,
        durationMs: (endMs ?? totalMs) - span.startMs,
        status: endMs == null ? "interrupted" : span.status,
      }));
      const modelCallsByPhase = {};
      let modelCalls = 0;
      for (const span of spans) {
        if (span.phase !== "model_attempt") continue;
        modelCalls += 1;
        const phase = span.modelStage ?? "model_attempt";
        modelCallsByPhase[phase] = (modelCallsByPhase[phase] ?? 0) + 1;
      }
      const data = {
        id: trace.requestId ?? randomUUID(), startedAt: trace.startedAt, entry: trace.entry, path: trace.path,
        outcome: interrupted ? "interrupted"
          : res.statusCode >= 500 ? "error"
            : trace.outcome ?? (res.statusCode >= 400 ? "error" : "reply"),
        httpStatus: interrupted ? null : res.statusCode,
        totalMs, modelCalls, modelCallsByPhase,
        spans, phaseMs: mergePhaseIntervals(spans),
      };
      setImmediate(async () => {
        try {
          await save(data);
        } catch (error) {
          console.warn("[conversationLatency] trace write failed", error?.code);
        }
      });
    };
    res.once("finish", () => trace.record(false));
    res.once("close", () => trace.record(!res.writableFinished));
    next();
  };
}

export function withConversationLatency(handler) {
  // Request-body parsing can resume in a socket callback. Enter the trace context at the handler.
  return (req, res, next) => activeTrace.run({ trace: req[requestTrace] }, () => handler(req, res, next));
}

export function withoutConversationLatency(run) {
  return activeTrace.exit(run);
}

export function admitConversationLatency(entry, path, requestId) {
  const trace = activeTrace.getStore()?.trace;
  if (!trace) return;
  trace.entry = entry;
  trace.path = path;
  trace.requestId = requestId;
  const interrupted = trace.disconnectedAt != null;
  const endedAt = trace.disconnectedAt ?? trace.clock();
  trace.spans.push({ phase: "ingress", startMs: 0, endMs: Math.round(endedAt - trace.origin), status: interrupted ? "interrupted" : "ok" });
  if (interrupted) trace.record(true, endedAt);
}

export function markConversationLatency({ path, outcome, defaultOutcome }) {
  const trace = activeTrace.getStore()?.trace;
  if (!trace?.entry || trace.closed) return;
  if (path) trace.path = path;
  if (outcome) trace.outcome = outcome;
  trace.outcome ??= defaultOutcome;
}

export function beginLatencyStage(phase, detail) {
  const { trace, phase: parentPhase } = activeTrace.getStore() ?? {};
  if (!trace?.entry || trace.closed) return undefined;
  const span = { phase, startMs: Math.round(trace.clock() - trace.origin) };
  if (detail) span.detail = detail;
  if (phase === "model_attempt" && parentPhase) span.modelStage = parentPhase;
  trace.spans.push(span);
  return (status = "ok") => {
    if (trace.closed) return;
    span.endMs = Math.round(trace.clock() - trace.origin);
    span.status = status;
  };
}

export function timeLatencyStage(phase, run, detail, isSuccessful) {
  const finish = beginLatencyStage(phase, detail);
  if (!finish) return run();
  const fail = (error) => {
    finish(error?.name === "TimeoutError" ? "timeout" : "error");
    throw error;
  };
  try {
    const context = activeTrace.getStore();
    const value = phase === "model_attempt" ? run() : activeTrace.run({ trace: context.trace, phase }, run);
    if (typeof value?.then === "function") {
      return Promise.resolve(value).then((result) => {
        finish(isSuccessful && !isSuccessful(result) ? "error" : "ok");
        return result;
      }, fail);
    }
    finish(isSuccessful && !isSuccessful(value) ? "error" : "ok");
    return value;
  } catch (error) {
    return fail(error);
  }
}

export function mergePhaseIntervals(spans) {
  const phases = new Map();
  for (const { phase, startMs, durationMs } of spans) {
    if (!phases.has(phase)) phases.set(phase, []);
    phases.get(phase).push([startMs, startMs + durationMs]);
  }
  return Object.fromEntries([...phases].map(([phase, intervals]) => {
    let edge = 0;
    let duration = 0;
    for (const [start, end] of intervals.sort(([a], [b]) => a - b)) {
      duration += Math.max(0, end - Math.max(start, edge));
      edge = Math.max(edge, end);
    }
    return [phase, duration];
  }));
}
