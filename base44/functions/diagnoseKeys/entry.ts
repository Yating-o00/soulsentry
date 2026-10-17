import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function testModel(model) {
    try {
        const key = (Deno.env.get("KIMI_API_KEY") || '').trim().replace(/[\r\n\s]/g, '');
        const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }] })
        });
        return { status: response.status, body: (await response.text()).slice(0, 150) };
    } catch (e) {
        return { error: e.message };
    }
}

Deno.serve(async (req) => {
    const results = {};
    // 列出国际站可用模型
    try {
        const key = (Deno.env.get("KIMI_API_KEY") || '').trim().replace(/[\r\n\s]/g, '');
        const listResp = await fetch("https://api.moonshot.ai/v1/models", {
            headers: { "Authorization": `Bearer ${key}` }
        });
        const listJson = await listResp.json();
        results.available_models = (listJson.data || []).map(m => m.id);
    } catch (e) {
        results.available_models = e.message;
    }
    // 测几个常见国际站模型名
    for (const m of ['kimi-k2-0711-preview', 'moonshot-v1-8k', 'moonshot-v1-auto', 'kimi-latest']) {
        results[m] = await testModel(m);
    }
    return Response.json(results);
});