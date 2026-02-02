import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            return Response.json({ status: "error", message: "MOONSHOT_API_KEY is not set in secrets" });
        }

        const cleanKey = apiKey.trim();
        
        // Test with a simple chat completion
        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanKey}`
            },
            body: JSON.stringify({
                model: "moonshot-v1-8k",
                messages: [
                    { role: "system", content: "You are a test bot." },
                    { role: "user", content: "Ping" }
                ],
                max_tokens: 10
            })
        });

        let data;
        const text = await response.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }

        return Response.json({
            status: response.status,
            statusText: response.statusText,
            key_preview: `${cleanKey.substring(0, 5)}...`,
            response: data
        });

    } catch (error) {
        return Response.json({ status: "exception", message: error.message, stack: error.stack });
    }
});