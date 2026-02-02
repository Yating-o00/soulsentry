import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const moonshotKey = Deno.env.get("MOONSHOT_API_KEY") || "";
        const cleanKey = moonshotKey.trim();
        
        const maskedKey = cleanKey.length > 8 
            ? `${cleanKey.substring(0, 4)}...${cleanKey.substring(cleanKey.length - 4)}` 
            : "Too short";

        console.log(`Testing Moonshot Key: ${maskedKey} (Length: ${cleanKey.length})`);

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanKey}`
            },
            body: JSON.stringify({
                model: "moonshot-v1-8k",
                messages: [
                    { role: "user", content: "Hi" }
                ],
                max_tokens: 5
            })
        });

        const data = await response.json();
        
        return Response.json({
            status: response.status,
            success: response.ok,
            key_used: maskedKey,
            data: data
        });

    } catch (error) {
        return Response.json({ status: "exception", message: error.message });
    }
});