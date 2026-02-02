import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
    const results = {};
    
    // Test Moonshot
    try {
        const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
        if (moonshotKey) {
            const cleanKey = moonshotKey.trim().replace(/[\r\n\s]/g, '');
            const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cleanKey}` },
                body: JSON.stringify({ model: "moonshot-v1-8k", messages: [{ role: "user", content: "Hi" }] })
            });
            results.moonshot = { status: response.status, body: await response.text() };
        } else {
            results.moonshot = "No key";
        }
    } catch (e) { results.moonshot = e.message; }

    // Test OpenAI
    try {
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (openaiKey) {
            const cleanKey = openaiKey.trim().replace(/[\r\n\s]/g, '');
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cleanKey}` },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] })
            });
            results.openai = { status: response.status, body: await response.text() };
        } else {
            results.openai = "No key";
        }
    } catch (e) { results.openai = e.message; }

    return Response.json(results);
});