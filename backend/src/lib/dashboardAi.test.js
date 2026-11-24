import test from "node:test";
import assert from "node:assert/strict";
import { invokeDashboardAi, resolveDashboardAiProvider } from "./dashboardAi.js";

const ENV_NAMES = [
  "CHAT_AI_PROVIDER", "KIMI_API_KEY", "KIMI_BASE_URL", "MOONSHOT_API_KEY",
  "KIMI_FALLBACK_API_KEY", "MOONSHOT_FALLBACK_API_KEY", "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL", "DASHBOARD_TEXT_MODELS",
];

function preserveEnv(t) {
  const previous = ENV_NAMES.map((name) => [name, process.env[name]]);
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const name of ENV_NAMES) delete process.env[name];
}

function jsonResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 12 } }), { status: 200 });
}

test("今日对话优先 Kimi，Kimi 不可用时自动切换 DeepSeek", async (t) => {
  preserveEnv(t);
  process.env.KIMI_API_KEY = "test-kimi-key";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, request) => {
    calls.push({ url, body: JSON.parse(request.body) });
    if (String(url).includes("moonshot")) {
      return new Response(JSON.stringify({ error: { message: "insufficient balance" } }), { status: 429 });
    }
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(JSON.parse(request.body).model, "deepseek-chat");
    return jsonResponse('{"reply":"deepseek answer"}');
  });

  const result = await invokeDashboardAi({
    prompt: "帮我看看今天该先做什么",
    systemPrompt: "return JSON",
    responseJsonSchema: { type: "object" },
    models: ["kimi-k3"],
    maxTokens: 2500,
    withUsage: true,
  });

  assert.equal(result.data.reply, "deepseek answer");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /moonshot/);
  assert.equal(calls[0].body.model, "kimi-k3");
});

test("规划类单次尝试模式下 Kimi 欠费仍会切换 DeepSeek 兜底", async (t) => {
  preserveEnv(t);
  process.env.KIMI_API_KEY = "test-kimi-key";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, request) => {
    calls.push({ url, body: JSON.parse(request.body) });
    if (String(url).includes("moonshot")) {
      return new Response(JSON.stringify({ error: { message: "Your account is suspended due to insufficient balance" } }), { status: 429 });
    }
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(JSON.parse(request.body).model, "deepseek-chat");
    return jsonResponse('{"reply":"deepseek plan answer"}');
  });

  const result = await invokeDashboardAi({
    prompt: "帮我查看今日的几个约定",
    systemPrompt: "return JSON",
    responseJsonSchema: { type: "object" },
    models: ["kimi-k3"],
    maxTokens: 2500,
    singleAttempt: true,
    withUsage: true,
  });

  assert.equal(result.data.reply, "deepseek plan answer");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /moonshot/);
  assert.equal(calls[0].body.model, "kimi-k3");
  assert.match(calls[1].url, /deepseek/);
});

test("Kimi 正常时只调用 Kimi，不会浪费 DeepSeek 请求", async (t) => {
  preserveEnv(t);
  process.env.KIMI_API_KEY = "test-kimi-key";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /moonshot/);
    return jsonResponse('{"reply":"kimi answer"}');
  });

  const result = await invokeDashboardAi({
    prompt: "test prompt",
    systemPrompt: "return JSON",
    responseJsonSchema: { type: "object" },
    withUsage: true,
  });

  assert.equal(result.data.reply, "kimi answer");
  assert.equal(fetch.mock.callCount(), 1);
});

test("Kimi 主用但未配置时，直接在 DeepSeek 上继续对话", async (t) => {
  preserveEnv(t);
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /deepseek/);
    return jsonResponse('{"reply":"deepseek only"}');
  });

  const result = await invokeDashboardAi({
    prompt: "test prompt",
    responseJsonSchema: { type: "object" },
    withUsage: true,
  });
  assert.equal(result.data.reply, "deepseek only");
});

test("Kimi 与 DeepSeek 都未配置时给出明确错误", async (t) => {
  preserveEnv(t);
  await assert.rejects(
    invokeDashboardAi({ prompt: "test prompt", responseJsonSchema: { type: "object" } }),
    /KIMI_API_KEY \/ MOONSHOT_API_KEY \/ DEEPSEEK_API_KEY 均未配置/
  );
});

test("Kimi 是默认 provider，内部调用可以覆盖部署配置", (t) => {
  const previous = process.env.CHAT_AI_PROVIDER;
  t.after(() => {
    if (previous === undefined) delete process.env.CHAT_AI_PROVIDER;
    else process.env.CHAT_AI_PROVIDER = previous;
  });
  delete process.env.CHAT_AI_PROVIDER;
  assert.equal(resolveDashboardAiProvider(), "kimi");
  process.env.CHAT_AI_PROVIDER = "deepseek";
  assert.equal(resolveDashboardAiProvider(), "deepseek");
  assert.equal(resolveDashboardAiProvider("kimi"), "kimi");
  assert.throws(() => resolveDashboardAiProvider("other"), /Unsupported chat AI provider/);
});

test("显式指定 DeepSeek provider 时发送结构化请求", async (t) => {
  preserveEnv(t);
  process.env.CHAT_AI_PROVIDER = "kimi";
  process.env.DEEPSEEK_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse(request.body);
    assert.equal(body.model, "deepseek-chat");
    assert.equal(body.messages[1].content, "test prompt");
    assert.equal(body.response_format.type, "json_object");
    return jsonResponse('{"reply":"hello"}');
  });
  const result = await invokeDashboardAi(
    { prompt: "test prompt", systemPrompt: "return JSON", maxTokens: 100 },
    { provider: "deepseek", model: "deepseek-chat" }
  );
  assert.equal(result.data.reply, "hello");
  assert.equal(result.usage.total_tokens, 12);
});
