import test from "node:test";
import assert from "node:assert/strict";
import { invokeDashboardAi } from "./dashboardAi.js";

test("dashboard chat sends structured requests to DeepSeek and returns its response", async (t) => {
  const oldFetch = globalThis.fetch;
  const oldProvider = process.env.CHAT_AI_PROVIDER;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldProvider === undefined) delete process.env.CHAT_AI_PROVIDER; else process.env.CHAT_AI_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
  });
  process.env.CHAT_AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  globalThis.fetch = async (url, request) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(request.body);
    assert.equal(body.model, "deepseek-flash");
    assert.equal(body.messages[1].content, "test prompt");
    assert.equal(body.response_format.type, "json_object");
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"hello"}' } }], usage: { total_tokens: 12 } }), { status: 200 });
  };
  const result = await invokeDashboardAi({ prompt: "test prompt", systemPrompt: "return JSON", maxTokens: 100 });
  assert.equal(result.data.reply, "hello");
  assert.equal(result.usage.total_tokens, 12);
});
