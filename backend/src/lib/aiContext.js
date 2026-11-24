import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage();
export const getAiContext = () => storage.getStore();
export function recordAiAttempt(attempt) {
  const context = getAiContext();
  if (context) {
    if (!context.attempts.includes(attempt)) context.attempts.push(attempt);
    if (attempt.outcome !== "pending") console.info("[aiAttempt]", JSON.stringify({ requestId: context.requestId, ...attempt }));
  }
}
export function aiTrace(source) {
  const context = getAiContext();
  if (!context) return null;
  const successful = context.attempts.filter((a) => a.outcome === "success");
  const actual = successful.at(-1);
  return {
    requestId: context.requestId,
    requestedProvider: context.provider || process.env.CHAT_AI_PROVIDER?.trim() || "kimi",
    source: source || (actual ? "ai" : "local"),
    provider: source && source !== "ai" ? null : actual?.provider || null,
    model: source && source !== "ai" ? null : actual?.model || null,
    attempts: context.attempts.map((a) => ({ ...a })),
    elapsedMs: Date.now() - context.startedAt,
  };
}

export function aiRequestContext(req, res, next) {
  // Authenticated AI POSTs only; clients may select a provider, never keys/URLs/models.
  const provider = req.get("X-Chat-AI-Provider");
  if (provider && !["kimi", "deepseek"].includes(provider)) {
    return res.status(400).json({ error: "INVALID_AI_PROVIDER" });
  }
  if (provider && process.env.CHAT_AI_EXPERIMENT_ENABLED !== "1") {
    return res.status(403).json({ error: "AI_EXPERIMENT_DISABLED", message: "模型切换实验暂未开放" });
  }
  if (provider === "deepseek" && !process.env.DEEPSEEK_API_KEY?.trim()) {
    return res.status(503).json({ error: "AI_PROVIDER_UNAVAILABLE", message: "DeepSeek 暂不可用，请切回默认模型" });
  }
  const context = { provider, requestId: randomUUID(), startedAt: Date.now(), attempts: [] };
  return storage.run(context, () => {
    res.setHeader("X-Request-ID", context.requestId);
    const json = res.json.bind(res);
    res.json = (body) => {
      const source = res.statusCode >= 400 ? "error" : body?.skipped ? "cached" : body?.degraded || body?.used_fallback ? "fallback"
        : body?.source || body?.ai_analysis?.source;
      const normalizedSource = ["kimi", "deepseek"].includes(source) ? "ai" : source;
      const trace = body?.reply?.meta?.ai || (!body?.skipped && body?.ai_analysis?.ai) || aiTrace(normalizedSource);
      if (body?.skipped) trace.cached = true;
      console.info("[chatAi]", JSON.stringify({ ...trace, route: req.baseUrl + req.path, status: res.statusCode }));
      return json({ ...body, ai: trace });
    };
    next();
  });
}
