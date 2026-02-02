import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        const body = await req.json();
        const input = body.input;

        if (!input) {
            return Response.json({ error: 'Input is required' }, { status: 400 });
        }

        const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        
        // Fetch User Context
        let userContext = "";
        try {
            const [behaviors, recentTasks] = await Promise.all([
                base44.entities.UserBehavior.list('-created_date', 10).catch(() => []),
                base44.entities.Task.list('-created_date', 5).catch(() => [])
            ]);
            const behaviorSummary = behaviors.map(b => `${b.event_type} (${b.category})`).join(', ');
            const taskSummary = recentTasks.map(t => `${t.title} (${t.priority}, ${t.category})`).join(', ');
            userContext = `Recent Behaviors: ${behaviorSummary}\nRecent Tasks: ${taskSummary}`;
        } catch (e) {
            console.warn("Failed to fetch user context", e);
        }

        const systemPrompt = `
You are "SoulSentry" (心栈), an advanced AI schedule hub. 
Your goal is to analyze the user's input and generate a structured plan.

**Output Structure (JSON):**
{
  "devices": {
    "phone": { "name": "智能手机", "strategies": [{"time": "string", "method": "string", "content": "string", "priority": "high|medium|low"}] },
    "watch": { "name": "智能手表", "strategies": [] },
    "glasses": { "name": "智能眼镜", "strategies": [] },
    "car": { "name": "电动汽车", "strategies": [] },
    "home": { "name": "智能家居", "strategies": [] },
    "pc": { "name": "工作站", "strategies": [] }
  },
  "timeline": [{ "time": "HH:MM", "title": "string", "desc": "string", "icon": "string", "highlight": boolean }],
  "automations": [{ "title": "string", "desc": "string", "status": "active|ready", "icon": "string" }]
}

**Context:**
Current Time: ${getShanghaiTime()}
User Input: "${input}"
User Context: ${userContext}
`;

        let result = null;
        let provider = null;

        // 1. Try Moonshot
        if (moonshotKey) {
            try {
                const cleanKey = moonshotKey.trim().replace(/[\r\n\s]/g, '');
                console.log(`Attempting Moonshot...`);
                const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${cleanKey}`
                    },
                    body: JSON.stringify({
                        model: "moonshot-v1-8k",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: input }
                        ],
                        temperature: 0.3
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const content = data.choices[0].message.content;
                    // Attempt to extract JSON if wrapped in markdown
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        result = JSON.parse(jsonMatch[0]);
                        provider = 'moonshot';
                    } else {
                        result = JSON.parse(content);
                        provider = 'moonshot';
                    }
                } else {
                    console.error(`Moonshot failed: ${response.status} ${await response.text()}`);
                }
            } catch (e) {
                console.error("Moonshot error:", e);
            }
        }

        // 2. Try OpenAI
        if (!result && openaiKey) {
            try {
                console.log("Falling back to OpenAI...");
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openaiKey.trim()}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: input }
                        ],
                        temperature: 0.3,
                        response_format: { type: "json_object" }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    result = JSON.parse(data.choices[0].message.content);
                    provider = 'openai';
                } else {
                    console.error("OpenAI failed:", await response.text());
                }
            } catch (e) {
                console.error("OpenAI error:", e);
            }
        }

        // 3. Fallback to Base44 Core (InvokeLLM)
        if (!result) {
            try {
                console.error("Falling back to Base44 Core...");
                const combinedPrompt = `${systemPrompt}\n\nUser Input: ${input}`;
                
                // Use standard user client for integrations
                const response = await base44.integrations.Core.InvokeLLM({
                    prompt: combinedPrompt,
                    response_json_schema: {
                        type: "object",
                        properties: {
                             devices: { type: "object", additionalProperties: true },
                             timeline: { type: "array", items: { type: "object", additionalProperties: true } },
                             automations: { type: "array", items: { type: "object", additionalProperties: true } }
                        },
                        required: ["devices", "timeline", "automations"]
                    }
                });
                
                if (response) {
                    result = response;
                    provider = 'base44-core';
                }
            } catch (e) {
                console.error("Base44 Core error:", e.message);
                if (e.response) console.error("Base44 Core response:", await e.response.text().catch(()=>""));
            }
        }

        if (!result) {
            return Response.json({ error: 'All AI providers failed (including fallback). Please check API keys.' }, { status: 500 });
        }

        result._meta = { provider };
        return Response.json(result);

    } catch (error) {
        console.error("Function error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});