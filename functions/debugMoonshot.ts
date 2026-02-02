import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
    try {
        // Simple auth check
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json({ error: 'No API Key' }, { status: 500 });

        console.log("Debug: Testing Moonshot API with key starting:", apiKey.trim().substring(0, 8));

        const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model: "moonshot-v1-8k",
                messages: [
                    { role: "user", content: "Hello, are you working?" }
                ]
            })
        });

        const data = await resp.text();
        console.log("Moonshot Status:", resp.status);
        console.log("Moonshot Response:", data);

        return Response.json({ 
            status: resp.status, 
            headers: Object.fromEntries(resp.headers.entries()),
            body: data 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});