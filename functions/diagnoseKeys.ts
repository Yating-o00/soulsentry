import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
    const results = { moonshot: null, openai: null };
    
    // Check Moonshot
    const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
    if (moonshotKey) {
        try {
            const resp = await fetch("https://api.moonshot.cn/v1/models", {
                headers: { "Authorization": `Bearer ${moonshotKey.trim()}` }
            });
            results.moonshot = { status: resp.status, valid: resp.ok };
        } catch (e) {
            results.moonshot = { error: e.message };
        }
    } else {
        results.moonshot = "Missing";
    }

    // Check OpenAI
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) {
        try {
            const resp = await fetch("https://api.openai.com/v1/models", {
                headers: { "Authorization": `Bearer ${openaiKey.trim()}` }
            });
            results.openai = { status: resp.status, valid: resp.ok };
        } catch (e) {
            results.openai = { error: e.message };
        }
    } else {
        results.openai = "Missing";
    }

    return Response.json(results);
});