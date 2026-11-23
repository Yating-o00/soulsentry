import { invokeKimiText, parseModelJson } from "./kimi.js";

// Internal default for companion chat, planning and memory jobs. Only trusted
// server-side callers can override it; request bodies never select a provider.
const DEFAULT_DASHBOARD_AI_PROVIDER = "kimi";

export function resolveDashboardAiProvider(provider) {
  const selected = provider ?? (process.env.CHAT_AI_PROVIDER?.trim() || DEFAULT_DASHBOARD_AI_PROVIDER);
  if (selected !== "kimi" && selected !== "deepseek") throw new Error(`Unsupported chat AI provider: ${selected}`);
  return selected;
}

export async function invokeDashboardAi(options, { provider: internalProvider, model: internalModel } = {}) {
  const provider = resolveDashboardAiProvider(internalProvider);
  // Kimi 主用，DeepSeek 兜底：Kimi 欠费/超时/空内容时由 callKimiChat 自动切换，
  // 不再直接把失败抛给 flowChat 去走本地模板话术
  if (provider === "kimi") return invokeKimiText({ ...options, allowDeepSeekFallback: true });

  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  const model = internalModel ?? (process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const messages = [];
  if (options.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: options.prompt });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.fetchTimeout || 30000)])
      : AbortSignal.timeout(options.fetchTimeout || 30000),
  });
  if (!response.ok) throw new Error(`DeepSeek API returned HTTP ${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new Error("DeepSeek returned an empty response"), { code: "PLAN_JSON", usage: result.usage });
  try {
    const data = parseModelJson(content);
    console.log(`[dashboardAi] provider=deepseek model=${model} success`);
    return { data, usage: result.usage || null, model };
  } catch {
    // Even malformed output can be billed.
    throw Object.assign(new Error("DeepSeek returned invalid JSON"), { code: "PLAN_JSON", usage: result.usage });
  }
}
