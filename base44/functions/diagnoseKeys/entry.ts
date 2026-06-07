import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function testModel(key, model) {
    try {
        const cleanKey = key.trim().replace(/[\r\n\s]/g, '');
        const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cleanKey}` },
            body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 })
        });
        return { status: response.status, ok: response.ok };
    } catch (e) {
        return { error: e.message };
    }
}

Deno.serve(async (req) => {
    const key = Deno.env.get("KIMI_API_KEY");
    const models = ["moonshot-v1-8k", "moonshot-v1-auto", "kimi-latest", "kimi-k2-0711-preview", "kimi-k2-turbo-preview"];
    const results = {};
    for (const m of models) {
        results[m] = await testModel(key, m);
    }
    return Response.json(results);
});