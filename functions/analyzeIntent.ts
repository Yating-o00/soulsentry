import { createClientFromRequest } from 'npm:@base44/sdk@0.8.11';
import OpenAI from 'npm:openai';

// Helper to get the current date/time in Shanghai timezone
const getShanghaiTime = () => {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

Deno.serve(async (req) => {
    try {
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                }
            });
        }

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { input, image_urls } = await req.json();

        if (!input && (!image_urls || image_urls.length === 0)) {
            return Response.json({ error: 'Input is required' }, { status: 400 });
        }

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            return Response.json({ error: 'Moonshot API Key not configured' }, { status: 500 });
        }

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: "https://api.moonshot.cn/v1",
        });

        const systemPrompt = `
You are "SoulSentry" (心栈), an advanced AI schedule hub. 
Your goal is to analyze the user's input and generate a structured plan for device coordination, context-aware timeline, and automated execution.

**Core Philosophy:**
- **Context-Aware**: Understand the implicit context (location, travel, weather, people).
- **Device Synergy**: Distribute information to the most appropriate device (Phone, Watch, Glasses, Car, Home, PC).
- **Proactive**: Don't just remind; prepare. (e.g., if meeting, prepare files; if traveling, check traffic).
- **Tone**: Warm, empathetic, yet efficient. (Simplifed Chinese).

**Input Analysis:**
Current Time: ${getShanghaiTime()}
User Input: "${input}"

**Output Requirement:**
Return a valid JSON object strictly following this structure:

{
  "devices": {
    "phone": { "name": "智能手机", "strategies": [{"time": "string", "method": "string", "content": "string", "priority": "high|medium|low"}] },
    "watch": { "name": "智能手表", "strategies": [] },
    "glasses": { "name": "智能眼镜", "strategies": [] },
    "car": { "name": "电动汽车", "strategies": [] },
    "home": { "name": "智能家居", "strategies": [] },
    "pc": { "name": "工作站", "strategies": [] }
  },
  "timeline": [
    {
      "time": "HH:MM", 
      "title": "string", 
      "desc": "string", 
      "icon": "string (single emoji)", 
      "highlight": boolean
    }
  ],
  "automations": [
    {
      "title": "string", 
      "desc": "string", 
      "status": "active|ready|monitoring|pending", 
      "icon": "string (single emoji)"
    }
  ]
}

**Guidelines for Generation:**
1. **Devices**: 
   - 'phone' is the hub. 
   - 'watch' for quick, tactile alerts. 
   - 'glasses' for AR info/real-time aid. 
   - 'car' for travel/navigation. 
   - 'home' for morning/evening routines. 
   - 'pc' for deep work/prep.
   - If a device isn't relevant to the specific intent, provide a generic "Standby" or "Monitoring" strategy for it, or leave strategies empty if truly irrelevant.
2. **Timeline**: Create a fluid timeline. Include preparation steps (e.g., "Sleep prep" the night before, "Wake up", "Depart", "Meeting", "Review").
3. **Automations**: Identify tasks the system can do automatically (e.g., "Traffic monitoring", "File prep", "Weather check", "Meeting minutes").
`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: input }
        ];

        // If images are present (not supported by all Kimi models yet, but Kimi Vision exists. 
        // For 'kimi-k2-turbo-preview' specifically, it might be text-only. 
        // If image support is needed, we'd need to confirm model capabilities. 
        // Assuming text-only for now based on user's code snippet using 'kimi-k2-turbo-preview').
        // If the user input contains image content description (from frontend OCR), it's already in 'input'.

        const completion = await client.chat.completions.create({
            model: "kimi-k2-turbo-preview", // User specified model
            messages: messages,
            temperature: 0.6,
            response_format: { type: "json_object" } // Kimi supports this for structured output
        });

        const result = JSON.parse(completion.choices[0].message.content);

        return Response.json(result);

    } catch (error) {
        console.error("Function error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});