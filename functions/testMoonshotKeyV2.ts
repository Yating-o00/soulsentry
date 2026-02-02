import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!moonshotKey) {
            return Response.json({ status: "error", message: "MOONSHOT_API_KEY is not set in secrets" });
        }

        const cleanKey = moonshotKey.trim();
        
        // Mask key for logging safety
        const maskedKey = cleanKey.length > 8 
            ? `${cleanKey.substring(0, 4)}...${cleanKey.substring(cleanKey.length - 4)}` 
            : "Too short";

        console.log(`[Diagnostic] Testing Moonshot Key: ${maskedKey} (Length: ${cleanKey.length})`);

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

        let data;
        try {
            data = await response.json();
        } catch (e) {
            data = { error: "Failed to parse JSON response", raw: await response.text() };
        }
        
        return Response.json({
            status: response.status,
            success: response.ok,
            key_preview: maskedKey,
            data: data
        });

    } catch (error) {
        console.error("Test function error:", error);
        return Response.json({ status: "exception", message: error.message });
    }
});