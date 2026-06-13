import { env } from "../config/env.js";

const DEFAULT_BASE_URL = "https://api.moonshot.ai/v1";
const DEFAULT_TEXT_MODELS = ["kimi-latest", "moonshot-v1-auto", "moonshot-v1-8k"];
const DEFAULT_WEB_MODELS = ["kimi-latest", "moonshot-v1-auto"];

function ensureApiKey() {
  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    const error = new Error("KIMI_API_KEY 或 MOONSHOT_API_KEY 未配置");
    error.status = 500;
    throw error;
  }
  return apiKey.trim();
}

function getBaseUrl() {
  return (process.env.KIMI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
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
  tools
}) {
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();
  const candidateModels = model
    ? [model]
    : (Array.isArray(tools) && tools.length > 0 ? DEFAULT_WEB_MODELS : DEFAULT_TEXT_MODELS);

  let lastStatus = 0;
  let lastErrorText = "";

  for (const candidateModel of candidateModels) {
    const body = {
      model: candidateModel,
      messages,
      temperature,
      max_tokens: maxTokens
    };

    if (responseJsonSchema) {
      body.response_format = { type: "json_object" };
    }

    if (Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const data = await response.json();
      return {
        model: candidateModel,
        raw: data,
        content: data.choices?.[0]?.message?.content || "",
        message: data.choices?.[0]?.message || null,
        finishReason: data.choices?.[0]?.finish_reason || null
      };
    }

    lastStatus = response.status;
    lastErrorText = await response.text();
    if (![401, 403, 404, 429, 500, 502, 503].includes(response.status)) {
      break;
    }
  }

  const error = new Error(`Kimi API error ${lastStatus}: ${lastErrorText}`);
  error.status = 502;
  throw error;
}

export async function invokeKimiText({
  prompt,
  systemPrompt,
  responseJsonSchema,
  model,
  temperature
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
    temperature
  });

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
