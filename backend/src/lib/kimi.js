const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_FALLBACK_BASE_URL = "https://api.moonshot.ai/v1";
// 模型链说明：K2.7 只有编程版（code/code-highspeed），无通用对话版，且 K2 全系 2026-12 底下线；
// 故主用 K3 旗舰，K2.7 编程版与 K2.6 作兜底（账号无权限/下线时自动降级，不影响功能）；
// DeepSeek 作为最后一道兜底：Kimi 全部不可用（欠费/故障/下线）时接管文本对话
const DEFAULT_TEXT_MODELS = ["kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.6"];
const DEFAULT_WEB_MODELS = ["kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.6"];
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

function getEndpointConfigs() {
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
  if (deepseekApiKey) {
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
    const error = new Error("KIMI_API_KEY / MOONSHOT_API_KEY / DEEPSEEK_API_KEY 均未配置");
    error.status = 500;
    throw error;
  }

  return endpoints;
}

function shouldTryFallback(status, errorText = "") {
  // 401/403 是鉴权错误，重试无用，直接失败
  if ([401, 403].includes(status)) {
    return false;
  }
  if ([404, 408, 409, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  return /resource_not_found|rate limit|overload|timeout|aborted/i.test(errorText);
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
  temperature = 0.3,
  maxTokens = 4000,
  tools,
  fetchTimeout = 30000
}) {
  const endpoints = getEndpointConfigs();
  const candidateModels = model
    ? [model]
    : (Array.isArray(tools) && tools.length > 0 ? DEFAULT_WEB_MODELS : DEFAULT_TEXT_MODELS);

  let lastStatus = 0;
  let lastErrorText = "";
  let lastError = null;

  console.log(`[callKimiChat] start: models=${candidateModels.join(",")}, endpoints=${endpoints.map((e) => e.label).join(",")}, timeout=${fetchTimeout}ms, msgCount=${messages?.length || 0}`);

  for (let endpointIndex = 0; endpointIndex < endpoints.length; endpointIndex += 1) {
    const endpoint = endpoints[endpointIndex];
    // DeepSeek 等兜底端点自带模型列表，不沿用 Kimi 候选模型
    const modelsForEndpoint = Array.isArray(endpoint.models) && endpoint.models.length > 0 ? endpoint.models : candidateModels;

    for (const candidateModel of modelsForEndpoint) {
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
          signal: controller.signal
        });

        const duration = Date.now() - startAt;

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          // JSON 模式下内容不合法（个别模型会无视 response_format 输出自由文本或被截断）：
          // 视为本次失败，换下一个候选模型/端点重试，而不是直接把坏内容抛给调用方
          if (responseJsonSchema) {
            if (!content) {
              lastStatus = 200;
              lastErrorText = "RESPONSE_EMPTY";
              console.log(`[callKimiChat] empty content: endpoint=${endpoint.label}, model=${candidateModel}, duration=${duration}ms, finish=${data.choices?.[0]?.finish_reason}`);
              continue;
            }
            try {
              parseModelJson(content);
            } catch {
              lastStatus = 200;
              lastErrorText = "RESPONSE_NOT_JSON";
              console.log(`[callKimiChat] invalid json: endpoint=${endpoint.label}, model=${candidateModel}, duration=${duration}ms, head=${content.slice(0, 80)}`);
              continue;
            }
          }
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
        lastStatus = error?.status || 0;
        lastErrorText = error?.message || "Unknown request failure";
        console.log(`[callKimiChat] exception: endpoint=${endpoint.label}, model=${candidateModel}, duration=${duration}ms, error=${lastErrorText.slice(0, 200)}`);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
  }

  console.log(`[callKimiChat] exhausted all attempts, lastStatus=${lastStatus}, lastError=${lastErrorText.slice(0, 200)}`);

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
  throw error;
}

export async function invokeKimiText({
  prompt,
  systemPrompt,
  responseJsonSchema,
  model,
  temperature,
  maxTokens,
  fetchTimeout,
  withUsage = false
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
    temperature,
    maxTokens,
    fetchTimeout
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
