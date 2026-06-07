import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function testKey(label, key, url, model) {
    if (!key) return { [label]: 'No key' };
    try {
        const cleanKey = key.trim().replace(/[\r\n\s]/g, '');
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cleanKey}` },
            body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }] })
        });
        return { [label]: { status: response.status, body: (await response.text()).slice(0, 200) } };
    } catch (e) {
        return { [label]: e.message };
    }
}

Deno.serve(async (req) => {
    let results = {};
    // analyzeHeartSign 真实使用：KIMI_API_KEY + 国际站
    results = { ...results, ...await testKey('kimi_intl', Deno.env.get("KIMI_API_KEY"), "https://api.moonshot.ai/v1/chat/completions", "kimi-k2-0905-preview") };
    // 国内站对比
    results = { ...results, ...await testKey('kimi_cn', Deno.env.get("KIMI_API_KEY"), "https://api.moonshot.cn/v1/chat/completions", "moonshot-v1-8k") };
    results = { ...results, ...await testKey('moonshot_cn', Deno.env.get("MOONSHOT_API_KEY"), "https://api.moonshot.cn/v1/chat/completions", "moonshot-v1-8k") };
    return Response.json(results);
});