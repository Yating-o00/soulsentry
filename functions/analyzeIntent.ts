import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const getShanghaiTime = () => {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

Deno.serve(async (req) => {
    const logs = [];
    const log = (msg) => {
        console.log(msg);
        logs.push(msg);
    };
    const logError = (msg) => {
        console.error(msg);
        logs.push(`ERROR: ${msg}`);
    };

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
            return Response.json({ error: 'Unauthorized', logs }, { status: 401 });
        }

        const body = await req.json();
        const input = body.input;

        if (!input) {
            return Response.json({ error: 'Input is required', logs }, { status: 400 });
        }

        const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        
        // Fetch User Context
        let userContext = "";
        try {
            // Use parallel fetch
            const [behaviors, recentTasks] = await Promise.all([
                base44.entities.UserBehavior.list('-created_date', 10).catch(() => []),
                base44.entities.Task.list('-created_date', 5).catch(() => [])
            ]);
            const behaviorSummary = behaviors.map(b => `${b.event_type} (${b.category})`).join(', ');
            const taskSummary = recentTasks.map(t => `${t.title} (${t.priority}, ${t.category})`).join(', ');
            userContext = `Recent Behaviors: ${behaviorSummary}\nRecent Tasks: ${taskSummary}`;
        } catch (e) {
            logError(`Failed to fetch context: ${e.message}`);
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
                log(`Attempting Moonshot with key length ${cleanKey.length}...`);
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
                    try {
                        // Handle potential markdown wrapping
                        const jsonStr = content.replace(/^```json\s*|\s*```$/g, '');
                        result = JSON.parse(jsonStr);
                        provider = 'moonshot';
                        log("Moonshot success");
                    } catch (parseErr) {
                        logError("Moonshot JSON parse error: " + parseErr.message);
                    }
                } else {
                    logError(`Moonshot failed: ${response.status} ${await response.text()}`);
                }
            } catch (e) {
                logError("Moonshot error: " + e.message);
            }
        } else {
            log("No Moonshot key");
        }

        // 2. Try OpenAI
        if (!result && openaiKey) {
            try {
                log("Falling back to OpenAI...");
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
                    log("OpenAI success");
                } else {
                    logError("OpenAI failed: " + await response.text());
                }
            } catch (e) {
                logError("OpenAI error: " + e.message);
            }
        }

        // 3. Fallback to Base44 Core (InvokeLLM)
        if (!result) {
            try {
                log("Falling back to Base44 Core...");
                const combinedPrompt = `${systemPrompt}\n\nUser Input: ${input}`;
                
                // Try to use InvokeLLM without schema first to check if that's the issue, or with schema?
                // Using schema is safer for the frontend.
                // Check if base44.integrations exists
                if (!base44.integrations || !base44.integrations.Core) {
                     logError("base44.integrations.Core not found");
                     // Try service role
                     if (base44.asServiceRole && base44.asServiceRole.integrations && base44.asServiceRole.integrations.Core) {
                        log("Using Service Role integrations...");
                        const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
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
                            provider = 'base44-core-service';
                        }
                     } else {
                        logError("Service Role integrations also not found");
                     }
                } else {
                    // Use standard integrations
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
                }

            } catch (e) {
                logError("Base44 Core error: " + e.message);
                if (e.stack) logError(e.stack);
            }
        }

        if (!result) {
            return Response.json({ error: 'All AI providers failed. Please check API keys.', logs }, { status: 500 });
        }

        result._meta = { provider, logs };
        return Response.json(result);

    } catch (error) {
        logError("Function fatal error: " + error.message);
        return Response.json({ error: error.message, logs }, { status: 500 });
    }
});