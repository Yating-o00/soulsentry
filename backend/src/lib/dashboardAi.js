import { invokeKimiText, parseModelJson } from "./kimi.js";

// Keep the provider choice scoped to dashboard chat; other AI features use Kimi.
export async function invokeDashboardAi(options) {
  const provider = process.env.CHAT_AI_PROVIDER || "kimi";
  if (provider === "kimi") return invokeKimiText(options);
  if (provider !== "deepseek") throw new Error(`Unsupported chat AI provider: ${provider}`);

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-flash";
  const messages = [];
  if (options.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: options.prompt });

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.trim()}` },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
    signal: AbortSignal.timeout(options.fetchTimeout || 30000),
  });
  if (!response.ok) throw new Error(`DeepSeek API returned HTTP ${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty response");
  console.log(`[dashboardAi] provider=deepseek model=${model} success`);
  return { data: parseModelJson(content), usage: result.usage || null, model };
}
