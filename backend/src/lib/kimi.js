import { getAiContext, recordAiAttempt } from "./aiContext.js";

const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_FALLBACK_BASE_URL = "https://api.moonshot.ai/v1";
// 模型链说明：K2.7 只有编程版（code/code-highspeed），无通用对话版，且 K2 全系 2026-12 底下线；
// 故主用 K3 旗舰，K2.7 编程版与 K2.6 作兜底（账号无权限/下线时自动降级，不影响功能）；
// DeepSeek 作为最后一道兜底：Kimi 全部不可用（欠费/故障/下线）时接管文本对话
const DEFAULT_TEXT_MODELS = ["kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.6"];
const DEFAULT_WEB_MODELS = ["kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.6"];
// 交互式对话（小助手/搭子）优先走更快的模型，失败再降级到旗舰 K3；
// 复杂任务（解题/周报）仍走 DEFAULT_TEXT_MODELS；行程/灵感走 STRUCTURED_TEXT_MODELS。
export const FAST_TEXT_MODELS = String(process.env.FAST_TEXT_MODELS || "kimi-k2.7-code-highspeed,kimi-k3")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
// 结构化生成（行程/灵感）：K2.7 code-highspeed 出 JSON 通常 6-8 秒；
// 它的推理 token 会占输出预算，调用方需给到 6000 max_tokens。超时/失败再由 DeepSeek 兜底。
export const STRUCTURED_TEXT_MODELS = String(process.env.STRUCTURED_TEXT_MODELS || "kimi-k2.7-code-highspeed")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
// 今日页小助手对话：优先 Kimi K2.7 code-highspeed（实测 1-3 秒返回），
// 再由 callKimiChat 自动切 DeepSeek 兜底。K3 虽然质量更稳，但对话首包常要 15-30 秒，
// 首页连续问答体感太慢；规划器仍单独使用 K3 保证复杂计划质量。
export const DASHBOARD_TEXT_MODELS = String(process.env.DASHBOARD_TEXT_MODELS || "kimi-k2.7-code-highspeed")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

function getEndpointConfigs(allowDeepSeekFallback) {
  const primaryApiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const primaryBaseUrl = (process.env.KIMI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fallbackApiKey = process.env.KIMI_FALLBACK_API_KEY || process.env.MOONSHOT_FALLBACK_API_KEY;
  const fallbackBaseUrl = (process.env.KIMI_FALLBACK_BASE_URL || DEFAULT_FALLBACK_BASE_URL).replace(/\/+$/, "");

  const endpoints = [];

  if (primaryApiKey) {
    endpoints.push({
      label: "primary",
      apiKey: primaryApiKey.trim(),
      baseUrl: primaryBaseUrl
    });
  }

  if (fallbackApiKey) {
    const normalizedFallbackKey = fallbackApiKey.trim();
    const isDuplicate = endpoints.some((item) => item.apiKey === normalizedFallbackKey && item.baseUrl === fallbackBaseUrl);
    if (!isDuplicate) {
      endpoints.push({
        label: "fallback",
        apiKey: normalizedFallbackKey,
        baseUrl: fallbackBaseUrl
      });
    }
  }

  // DeepSeek 兜底端点：排在最后，Kimi 各端点/模型全部失败后才启用；
  // models 固定在 DeepSeek 自有模型上，不会拿 Kimi 模型名去请求
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (allowDeepSeekFallback && deepseekApiKey) {
    const deepseekModels = String(process.env.DEEPSEEK_MODELS || "deepseek-chat")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    endpoints.push({
      label: "deepseek",
      apiKey: deepseekApiKey.trim(),
      baseUrl: (process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, ""),
      models: deepseekModels.length > 0 ? deepseekModels : ["deepseek-chat"]
    });
  }

  if (endpoints.length === 0) {
    const error = new Error(allowDeepSeekFallback
      ? "KIMI_API_KEY / MOONSHOT_API_KEY / DEEPSEEK_API_KEY 均未配置"
      : "Kimi 未配置 API Key");
    error.status = 500;
    throw error;
  }

  return endpoints;
}

function shouldTryFallback(status, errorText = "") {
  // 401/403 对同一 Kimi 账号重试无用，但换到独立配置的 DeepSeek 端点仍可继续对话；
  // 不能直接判死整条模型链，否则 Kimi Key 失效时今日对话会退化成固定兜底话术
  if ([401, 403].includes(status)) {
    return true;
  }
  // 402 欠费/余额不足：换下一个模型/端点（如 DeepSeek 兜底）继续尝试
  if ([400, 402, 404, 408, 409, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  return /resource_not_found|model_not_found|invalid model|unsupported model|rate limit|overload|timeout|aborted|insufficient/i.test(errorText);
}

function normalizeTemperature(model, temperature) {
  // Kimi K2/K3 系列模型目前只接受 temperature = 1
  if (String(model || "").startsWith("kimi-k")) {
    return 1;
  }
  return temperature;
}

function normalizeJsonString(content) {
  const raw = String(content || "").trim();
  if (!raw) return raw;

  const direct = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return direct;
}

export function parseModelJson(content) {
  const normalized = normalizeJsonString(content);

  try {
    return JSON.parse(normalized);
  } catch (_error) {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }
    throw new Error("Kimi 返回内容不是合法 JSON");
  }
}

export async function callKimiChat({
  messages,
  responseJsonSchema,
  model,
  models,
  temperature = 0.3,
  maxTokens = 4000,
  tools,
  fetchTimeout = 30000,
  signal,
  singleAttempt = false,
  allowDeepSeekFallback = true
}) {
  let endpoints = getEndpointConfigs(allowDeepSeekFallback);
  const hasImage = messages?.some((m) => Array.isArray(m.content) && m.content.some((part) => part.type === "image_url"));
  if (getAiContext()?.provider === "deepseek" && allowDeepSeekFallback && !tools?.length && !hasImage) {
    endpoints = endpoints.filter((endpoint) => endpoint.label === "deepseek");
    if (!endpoints.length) throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  if (hasImage || tools?.length) endpoints = endpoints.filter((endpoint) => endpoint.label !== "deepseek");
  const candidateModels = Array.isArray(models) && models.length > 0
    ? models
    : model
      ? [model]
      : (Array.isArray(tools) && tools.length > 0 ? DEFAULT_WEB_MODELS : DEFAULT_TEXT_MODELS);

  let lastStatus = 0;
  let lastErrorText = "";
  let lastError = null;

  console.log(`[callKimiChat] start: models=${candidateModels.join(",")}, endpoints=${endpoints.map((e) => e.label).join(",")}, timeout=${fetchTimeout}ms, msgCount=${messages?.length || 0}`);

  // singleAttempt 只限制每个端点只试一个模型（控制计划类请求的延迟），
  // 不能把后续端点一起砍掉——Kimi 欠费/故障时仍必须轮到 DeepSeek 兜底。
  for (const endpoint of endpoints) {
    // DeepSeek 等兜底端点自带模型列表，不沿用 Kimi 候选模型
    const modelsForEndpoint = Array.isArray(endpoint.models) && endpoint.models.length > 0 ? endpoint.models : candidateModels;
    const modelsToTry = singleAttempt ? modelsForEndpoint.slice(0, 1) : modelsForEndpoint;

    for (const candidateModel of modelsToTry) {
      signal?.throwIfAborted();
      const body = {
        model: candidateModel,
        messages,
        temperature: normalizeTemperature(candidateModel, temperature),
        max_tokens: maxTokens
      };

      if (responseJsonSchema) {
        body.response_format = { type: "json_object" };
      }

      // DeepSeek 不支持 Kimi 的内置联网工具（builtin_function）：兜底时退化为无工具回答
      if (endpoint.label !== "deepseek" && Array.isArray(tools) && tools.length > 0) {
        body.tools = tools;
      }

      let response;
      let timeoutId;
      const startAt = Date.now();
      const attempt = {
        provider: endpoint.label === "deepseek" ? "deepseek" : "kimi",
        endpoint: endpoint.label, model: candidateModel, outcome: "pending",
      };
      recordAiAttempt(attempt);
      try {
        console.log(`[callKimiChat] attempt: endpoint=${endpoint.label}(${endpoint.baseUrl}), model=${candidateModel}`);
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
        response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${endpoint.apiKey}`
          },
          body: JSON.stringify(body),
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
        });

        const duration = Date.now() - startAt;

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          // JSON 模式下内容不合法（个别模型会无视 response_format 输出自由文本或被截断）：
          // 视为本次失败，换下一个候选模型/端点重试，而不是直接把坏内容抛给调用方
          if (responseJsonSchema || (!content && !data.choices?.[0]?.message?.tool_calls?.length)) {
            if (!content) {
              lastStatus = 200;
              lastErrorText = "RESPONSE_EMPTY";
              attempt.reason = "empty_response";
              console.log(`[callKimiChat] empty content: endpoint=${endpoint.label}, model=${candidateModel}, duration=${duration}ms, finish=${data.choices?.[0]?.finish_reason}`);
              continue;
            }
            try {
              parseModelJson(content);
            } catch {
              lastStatus = 200;
              lastErrorText = "RESPONSE_NOT_JSON";
              attempt.reason = "invalid_json";
              console.log(`[callKimiChat] invalid json: endpoint=${endpoint.label}, model=${candidateModel}, duration=${duration}ms, head=${content.slice(0, 80)}`);
              continue;
            }
          }
          attempt.outcome = "success";
          console.log(`[callKimiChat] success: endpoint=${endpoint.label}, model=${candidateModel}, duration=${duration}ms`);
          return {
            endpoint: endpoint.label,
            baseUrl: endpoint.baseUrl,
            model: candidateModel,
            raw: data,
            content,
            message: data.choices?.[0]?.message || null,
            finishReason: data.choices?.[0]?.finish_reason || null
          };
        }

        lastStatus = response.status;
        attempt.status = response.status;
        attempt.reason = `http_${response.status}`;
        lastErrorText = await response.text();
        console.log(`[callKimiChat] http error: endpoint=${endpoint.label}, model=${candidateModel}, status=${lastStatus}, duration=${duration}ms, body=${lastErrorText.slice(0, 200)}`);
        lastError = null;

        if (!shouldTryFallback(response.status, lastErrorText)) {
          const error = new Error(`Kimi API error ${lastStatus}: ${lastErrorText}`);
          error.status = 502;
          throw error;
        }
      } catch (error) {
        const duration = Date.now() - startAt;
        lastError = error;
        attempt.reason ||= /abort|timeout/i.test(error?.name || "") ? "timeout" : "request_error";
        lastStatus = error?.status || 0;
        lastErrorText = error?.message || "Unknown request failure";
        console.log(`[callKimiChat] exception: endpoint=${endpoint.label}, model=${candidateModel}, duration=${duration}ms, error=${lastErrorText.slice(0, 200)}`);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        attempt.elapsedMs = Date.now() - startAt;
        if (attempt.outcome === "pending") attempt.outcome = "error";
        recordAiAttempt(attempt);
      }
    }
  }

  console.log(`[callKimiChat] exhausted all attempts, lastStatus=${lastStatus}, lastError=${lastErrorText.slice(0, 200)}`);

  signal?.throwIfAborted();
  if (lastError?.status && !shouldTryFallback(lastError.status, lastError.message || "")) {
    throw lastError;
  }

  const error = new Error(
    lastErrorText === "RESPONSE_NOT_JSON"
      ? "Kimi 返回内容不是合法 JSON"
      : lastErrorText === "RESPONSE_EMPTY"
        ? "Kimi 返回空内容（输出预算可能被推理耗尽，请调大 maxTokens 或重试）"
        : `Kimi API error ${lastStatus}: ${lastErrorText}`
  );
  error.status = 502;
  if (lastStatus === 200 && /RESPONSE_(?:EMPTY|NOT_JSON)/.test(lastErrorText)) error.code = "PLAN_JSON";
  throw error;
}

export async function invokeKimiText({
  prompt,
  systemPrompt,
  responseJsonSchema,
  model,
  models,
  temperature,
  maxTokens,
  fetchTimeout,
  signal,
  singleAttempt,
  withUsage = false,
  allowDeepSeekFallback = true
}) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const result = await callKimiChat({
    messages,
    responseJsonSchema,
    model,
    models,
    temperature,
    maxTokens,
    fetchTimeout,
    signal,
    singleAttempt,
    allowDeepSeekFallback
  });

  const usage = result.raw?.usage || null;

  if (withUsage) {
    const data = responseJsonSchema
      ? parseModelJson(result.content)
      : { text: result.content, model: result.model };
    return { data, usage, model: result.model };
  }

  if (responseJsonSchema) {
    return parseModelJson(result.content);
  }

  return { text: result.content, model: result.model };
}

export async function invokeKimiWebSearch({ query, language = "zh" }) {
  const systemPrompt = language === "en"
    ? "You are a research assistant. Use the builtin web search tool to answer with concise, up-to-date information. End with references."
    : "你是一名联网研究助手。请使用内置联网搜索工具检索最新信息后作答，回答简洁并附上参考链接。";

  const tools = [
    {
      type: "builtin_function",
      function: { name: "$web_search" }
    }
  ];

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query }
  ];

  const references = [];
  let finalContent = "";

  for (let i = 0; i < 6; i += 1) {
    const result = await callKimiChat({
      messages,
      tools,
      temperature: 0.2,
      maxTokens: 3000
    });

    const message = result.message;
    if (!message) break;

    messages.push(message);

    if (result.finishReason === "tool_calls" && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments || "{}");
        } catch (_error) {
          toolArgs = {};
        }

        if (Array.isArray(toolArgs.refs)) {
          toolArgs.refs.forEach((ref) => {
            if (ref?.url) {
              references.push({
                title: ref.title || ref.url,
                url: ref.url
              });
            }
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function?.name,
          content: JSON.stringify(toolArgs)
        });
      }
      continue;
    }

    finalContent = message.content || "";
    break;
  }

  return {
    answer: finalContent,
    references: references.slice(0, 10)
  };
}
