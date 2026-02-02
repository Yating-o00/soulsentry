import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
    try {
        const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!moonshotKey) return Response.json({error: "No key"});
        
        const cleanKey = moonshotKey.trim().replace(/[\r\n\s]/g, '');
        
        console.log("Fetching Moonshot...");
        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanKey}`
            },
            body: JSON.stringify({
                model: "moonshot-v1-8k",
                messages: [
                    { role: "user", content: "Hello" }
                ],
                temperature: 0.3
            })
        });
        
        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Body:", text);
        
        return Response.json({ 
            status: response.status,
            body: text,
            headers: Object.fromEntries(response.headers.entries())
        });
        
    } catch (e) {
        console.error("Debug Error:", e);
        return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
});