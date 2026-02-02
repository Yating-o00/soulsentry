import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            return Response.json({ status: "error", message: "MOONSHOT_API_KEY is not set" });
        }

        const cleanKey = apiKey.trim();
        const maskedKey = cleanKey.length > 8 
            ? `${cleanKey.substring(0, 4)}...${cleanKey.substring(cleanKey.length - 4)}` 
            : "Too short";

        console.log(`[International Test] Testing Moonshot Key against api.moonshot.ai: ${maskedKey}`);

        // Try the international endpoint as suggested
        const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanKey}`
            },
            body: JSON.stringify({
                model: "kimi-k2-turbo-preview", // Using the international model name
                messages: [
                    { role: "user", content: "Hello from International API test" }
                ],
                max_tokens: 10
            })
        });

        let data;
        try {
            data = await response.json();
        } catch (e) {
            data = { error: "Failed to parse JSON", raw: await response.text() };
        }
        
        return Response.json({
            endpoint: "https://api.moonshot.ai/v1",
            status: response.status,
            success: response.ok,
            key_preview: maskedKey,
            data: data
        });

    } catch (error) {
        return Response.json({ status: "exception", message: error.message });
    }
});