import test from "node:test";
import assert from "node:assert/strict";
import { invokeDashboardAi, resolveDashboardAiProvider } from "./dashboardAi.js";

test("the default dashboard route uses Kimi even when a DeepSeek key is set", async (t) => {
  const names = [
    "CHAT_AI_PROVIDER", "KIMI_API_KEY", "KIMI_BASE_URL", "MOONSHOT_API_KEY",
    "KIMI_FALLBACK_API_KEY", "MOONSHOT_FALLBACK_API_KEY", "DEEPSEEK_API_KEY",
  ];
  const previous = names.map((name) => [name, process.env[name]]);
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const name of names) delete process.env[name];
  process.env.KIMI_API_KEY = "test-kimi-key";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://api.moonshot.cn/v1/chat/completions");
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"hello"}' } }] }));
  });
  const options = { prompt: "test prompt", responseJsonSchema: { type: "object" }, withUsage: true };
  assert.equal((await invokeDashboardAi(options)).data.reply, "hello");
  assert.equal(fetch.mock.callCount(), 1);

  delete process.env.KIMI_API_KEY;
  await assert.rejects(invokeDashboardAi(options), /Kimi 未配置 API Key/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("Kimi is the default, and the internal provider can override the deployment setting", (t) => {
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

test("dashboard chat sends structured requests to DeepSeek and returns its response", async (t) => {
  const oldFetch = globalThis.fetch;
  const oldProvider = process.env.CHAT_AI_PROVIDER;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldProvider === undefined) delete process.env.CHAT_AI_PROVIDER; else process.env.CHAT_AI_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
  });
  process.env.CHAT_AI_PROVIDER = "kimi";
  process.env.DEEPSEEK_API_KEY = "test-key";
  globalThis.fetch = async (url, request) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(request.body);
    assert.equal(body.model, "deepseek-flash");
    assert.equal(body.messages[1].content, "test prompt");
    assert.equal(body.response_format.type, "json_object");
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"hello"}' } }], usage: { total_tokens: 12 } }), { status: 200 });
  };
  const result = await invokeDashboardAi({ prompt: "test prompt", systemPrompt: "return JSON", maxTokens: 100 }, { provider: "deepseek", model: "deepseek-flash" });
  assert.equal(result.data.reply, "hello");
  assert.equal(result.usage.total_tokens, 12);
});
