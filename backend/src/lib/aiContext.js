import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { getReleaseIdentity } from "./releaseIdentity.js";

const storage = new AsyncLocalStorage();
const attemptStates = new WeakMap();
const contextKey = Symbol("aiContext");
export const getAiContext = () => storage.getStore();
const safeToken = (value, max = 128) => typeof value === "string" && value.length <= max
  && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) && !/^(sk-|Bearer)/i.test(value) ? value : null;
const SOURCES = new Set(["ai", "local", "system", "cached", "fallback", "error"]);
const normalizeSource = (source) => SOURCES.has(source) ? source
  : source === "local_fallback" ? "fallback"
    : ["agent", "credits"].includes(source) ? "system"
      : ["kimi", "deepseek"].includes(source) ? "ai" : undefined;

function routeName(req) {
  // Express templates exclude IDs, query strings, and arbitrary path text.
  const base = new Set(["/api/companion", "/api/chat", "/api/buddies", "/api/functions", "/api/collab", "/api/collab-invite"]).has(req.baseUrl) ? req.baseUrl : "/api";
  const template = typeof req.route?.path === "string" ? req.route.path : "/:route";
  const name = req.params?.name;
  const knownFunction = ["analyzeHeartSign", "analyzeTask", "analyzeTasks", "generatePlan", "invokeLLM", "kimiStatus"].includes(name) ? name : null;
  return base === "/api/functions" && knownFunction ? `${base}/${knownFunction}`
    : `${base}${/^[/:A-Za-z0-9_-]+$/.test(template) ? template : "/:route"}`;
}

function frontendIdentity(req) {
  const deploymentId = safeToken(req.get("X-Frontend-Deployment-ID"));
  const sha = req.get("X-Frontend-Commit-SHA");
  const commitSha = /^[a-f0-9]{40}$/.test(sha || "") ? sha : null;
  const date = req.get("X-Frontend-Built-At");
  const builtAt = typeof date === "string" && date.length < 40 && /^\d{4}-\d\d-\d\dT/.test(date)
    && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
  return deploymentId || commitSha || builtAt ? { deploymentId, commitSha, builtAt } : null;
}

function createContext({ req, res, route, kind = "http" } = {}) {
  return {
    ...getReleaseIdentity(), requestId: randomUUID(), startedAt: Date.now(), attempts: [],
    frontendVersion: req ? frontendIdentity(req) : null, req, res, route, kind,
    active: false, finalized: false,
  };
}

function identity(context) {
  return {
    schemaVersion: 2, timestamp: new Date().toISOString(), deploymentId: context.deploymentId,
    commitSha: context.commitSha, requestId: context.requestId, kind: context.kind,
    requestedProvider: context.provider || safeToken(process.env.CHAT_AI_PROVIDER?.trim()) || "kimi",
    route: context.route || (context.req ? routeName(context.req) : "background"), frontendVersion: context.frontendVersion,
  };
}

function activate(context) {
  if (context.active) return;
  context.active = true;
  if (context.req) context.route = routeName(context.req);
  if (context.res && !context.res.headersSent) context.res.setHeader("X-Request-ID", context.requestId);
  console.info("[chatAi]", JSON.stringify({ ...identity(context), timestamp: new Date(context.startedAt).toISOString(), event: "request_started" }));
  if (context.finalized) {
    // A detached task can begin after a previously quiet HTTP response. Its
    // attempts retain the originating ID without claiming the response used AI.
    console.info("[chatAi]", JSON.stringify({
      ...identity(context), timestamp: new Date(context.finishedAt).toISOString(), event: "request_completed",
      source: "system", provider: null, model: null, status: context.finishedStatus ?? null,
      businessSuccess: null, outcome: "unknown", elapsedMs: context.finishedAt - context.startedAt,
      attempts: [], attemptIds: [],
    }));
  }
}

// Model APIs activate before configuration checks; quiet cron work stays quiet.
export function activateAiContext() {
  const context = getAiContext();
  if (context) activate(context);
}

function attemptSnapshot(attempt) {
  return {
    attemptId: attempt.attemptId, provider: safeToken(attempt.provider), model: safeToken(attempt.model),
    endpoint: safeToken(attempt.endpoint), outcome: attempt.outcome,
    status: Number.isInteger(attempt.status) ? attempt.status : null,
    reason: safeToken(attempt.reason, 64), errorCode: safeToken(attempt.errorCode, 64),
    upstreamRequestId: safeToken(attempt.upstreamRequestId),
    elapsedMs: Number.isFinite(attempt.elapsedMs) ? Math.max(0, attempt.elapsedMs) : null,
  };
}

export function recordAiAttempt(attempt) {
  const context = getAiContext();
  if (!context) return;
  activate(context);
  let state = attemptStates.get(attempt);
  if (!state) {
    attempt.attemptId = randomUUID();
    state = { completed: false };
    attemptStates.set(attempt, state);
    context.attempts.push(attempt);
    console.info("[aiAttempt]", JSON.stringify({ ...identity(context), ...attemptSnapshot(attempt), outcome: "pending", event: "started", late: context.finalized }));
  }
  if (attempt.outcome !== "pending" && !state.completed) {
    state.completed = true;
    console.info("[aiAttempt]", JSON.stringify({ ...identity(context), ...attemptSnapshot(attempt), event: "completed", late: context.finalized }));
  }
}

export function aiTrace(source) {
  const context = getAiContext();
  if (!context) return null;
  const actual = context.attempts.filter((a) => a.outcome === "success").at(-1);
  const normalized = normalizeSource(source);
  return {
    ...identity(context),
    source: normalized || (actual ? "ai" : "local"),
    provider: normalized && normalized !== "ai" ? null : actual?.provider || null,
    model: normalized && normalized !== "ai" ? null : actual?.model || null,
    attempts: context.attempts.map(attemptSnapshot), elapsedMs: Date.now() - context.startedAt,
  };
}

function complete(context, { trace, status, disconnected = false, businessSuccess = null } = {}) {
  if (context.finalized) return;
  context.finalized = true;
  context.finishedAt = Date.now();
  context.finishedStatus = status;
  if (!context.active) return;
  const final = { ...(trace || aiTrace(disconnected || status >= 400 ? "error" : undefined)), ...identity(context) };
  if (disconnected || status >= 400 || ["error", "fallback"].includes(final.source)) businessSuccess = false;
  console.info("[chatAi]", JSON.stringify({
    ...final, event: "request_completed", status: status ?? null, businessSuccess,
    outcome: businessSuccess === true ? "success" : businessSuccess === false ? "failure" : "unknown",
    elapsedMs: Date.now() - context.startedAt, disconnected,
    attemptIds: context.attempts.map((a) => a.attemptId),
  }));
}

// A global HTTP context is quiet until a model call or explicit AI endpoint activates it.
export function aiHttpContext(req, res, next) {
  if (req[contextKey]) return storage.run(req[contextKey], next);
  const context = createContext({ req, res });
  req[contextKey] = context;
  let result;
  const json = res.json.bind(res);
  res.json = (body) => storage.run(context, () => {
    context.route = routeName(req);
    if (!context.active) return json(body);
    const saved = body?.reply?.meta?.ai || (!body?.skipped && body?.ai_analysis?.ai);
    const source = res.statusCode >= 400 || body?.error ? "error" : body?.skipped ? "cached"
      : body?.degraded || body?.used_fallback ? "fallback" : body?.source || body?.ai_analysis?.source || saved?.source;
    const normalized = normalizeSource(source);
    const trace = aiTrace(normalized);
    if (trace.source === "ai" && saved?.requestId === context.requestId && saved.source === "ai") {
      trace.provider = safeToken(saved.provider);
      trace.model = safeToken(saved.model);
    }
    // Never reuse another request's cached IDs or attempts.
    if (body?.skipped) trace.cached = true;
    const explicitSuccess = typeof body?.businessSuccess === "boolean" ? body.businessSuccess
      : typeof body?.ok === "boolean" ? body.ok : typeof body?.success === "boolean" ? body.success : null;
    const businessSuccess = res.statusCode >= 400 || body?.error || ["fallback", "error"].includes(trace.source) ? false
      : explicitSuccess ?? (["cached", "local", "ai"].includes(normalized) ? true : null);
    result = { trace, status: res.statusCode, businessSuccess };
    if (!res.once) complete(context, result); // Small response doubles used by unit tests.
    return json(body && typeof body === "object" && !Array.isArray(body) ? { ...body, ai: trace } : body);
  });
  if (res.once) {
    res.once("finish", () => storage.run(context, () => complete(context, result || { status: res.statusCode })));
    res.once("close", () => { if (!res.writableFinished) storage.run(context, () => complete(context, { ...result, status: res.statusCode, disconnected: true })); });
  }
  return storage.run(context, next);
}

export function aiRequestContext(req, res, next) {
  return aiHttpContext(req, res, () => {
    const context = getAiContext();
    const provider = req.get("X-Chat-AI-Provider");
    if (["kimi", "deepseek"].includes(provider)) context.provider = provider;
    activate(context);
    res.setHeader("X-Request-ID", context.requestId);
    if (provider && !["kimi", "deepseek"].includes(provider)) return res.status(400).json({ error: "INVALID_AI_PROVIDER" });
    if (provider && process.env.CHAT_AI_EXPERIMENT_ENABLED !== "1") return res.status(403).json({ error: "AI_EXPERIMENT_DISABLED", message: "模型切换实验暂未开放" });
    if (provider === "deepseek" && !process.env.DEEPSEEK_API_KEY?.trim()) return res.status(503).json({ error: "AI_PROVIDER_UNAVAILABLE", message: "DeepSeek 暂不可用，请切回默认模型" });
    context.provider = provider;
    return next();
  });
}

export async function runAiTaskContext(route, work, describeResult = () => ({})) {
  if (getAiContext()) return work();
  const context = createContext({ route: safeToken(route) || "background", kind: "background" });
  return storage.run(context, async () => {
    try {
      const result = await work();
      // Completion of a model child is not proof of task business success.
      const description = describeResult(result);
      const failed = result?.degraded || result?.error || result?.used_fallback || result?.fallback;
      const success = failed ? false : typeof description?.businessSuccess === "boolean" ? description.businessSuccess
        : typeof result?.ok === "boolean" ? result.ok : typeof result?.businessSuccess === "boolean" ? result.businessSuccess : null;
      complete(context, { trace: failed ? aiTrace("fallback") : description?.source ? aiTrace(description.source) : undefined, status: null, businessSuccess: success });
      return result;
    } catch (error) {
      activate(context);
      complete(context, { trace: aiTrace("error"), status: null, businessSuccess: false });
      throw error;
    }
  });
}

export function classifyAiError({ status, errorText = "", error } = {}) {
  const text = String(errorText);
  if (text === "RESPONSE_EMPTY") return "empty_response";
  if (text === "RESPONSE_NOT_JSON") return "invalid_json";
  if (/insufficient[_ -]?(balance|quota|credit)|余额不足|欠费|account.*(balance|arrear)/i.test(text) || status === 402) return "insufficient_balance";
  if (status === 401 || status === 403) return "authentication_error";
  if (status === 429 || /rate[_ -]?limit|too many requests/i.test(text)) return "rate_limited";
  if (/timeout|abort/i.test(error?.name || "") || [408, 504].includes(status)) return "timeout";
  if (status) return "upstream_error";
  if (error instanceof SyntaxError) return "invalid_json";
  if (error instanceof TypeError || /ECONN|ENOTFOUND|EAI_AGAIN|EHOST|UND_ERR/.test(error?.code || error?.cause?.code || "")) return "network_error";
  return "unknown";
}

export function upstreamErrorDetails(response, text = "") {
  let value;
  try { value = JSON.parse(text); } catch { /* Never log raw error bodies. */ }
  return {
    reason: classifyAiError({ status: response.status, errorText: text }),
    errorCode: safeToken(value?.error?.code || value?.code || value?.error?.type, 64),
    upstreamRequestId: safeToken(response.headers?.get("x-request-id") || response.headers?.get("request-id") || value?.request_id),
  };
}
