import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            return Response.json({ status: "error", message: "MOONSHOT_API_KEY is not set" });
        }

        const cleanKey = apiKey.trim();
        
        // Try the international endpoint
        const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanKey}`
            },
            body: JSON.stringify({
                model: "kimi-k2-turbo-preview", // International model
                messages: [
                    { role: "user", content: "Test" }
                ],
                max_tokens: 5
            })
        });

        const data = await response.json();
        
        return Response.json({
            status: response.status,
            success: response.ok,
            data: data
        });

    } catch (error) {
        return Response.json({ status: "exception", message: error.message });
    }
});