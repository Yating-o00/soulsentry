import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

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
        
        if (!moonshotKey && !openaiKey) {
            return Response.json({ error: 'No AI API keys configured' }, { status: 500 });
        }

        // Fetch User Context for Personalization
        let userContext = "";
        try {
            const [behaviors, recentTasks] = await Promise.all([
                base44.entities.UserBehavior.list('-created_date', 10).catch(() => []),
                base44.entities.Task.list('-created_date', 5).catch(() => [])
            ]);

            const behaviorSummary = behaviors.map(b => `${b.event_type} (${b.category})`).join(', ');
            const taskSummary = recentTasks.map(t => `${t.title} (${t.priority}, ${t.category})`).join(', ');
            
            userContext = `
            Recent Behaviors: ${behaviorSummary}
            Recent Tasks: ${taskSummary}
            `;
        } catch (e) {
            console.warn("Failed to fetch user context", e);
        }

        const systemPrompt = `
You are "SoulSentry" (心栈), an advanced AI schedule hub. 
Your goal is to analyze the user's input and generate a structured plan for device coordination, context-aware timeline, and automated execution.

**1. Entity Recognition & Context Understanding:**
- **Entities**: Identify Time (when), Location (where), People (who), Event (what).
- **Implicit Context**: Infer underlying needs. (e.g., "Meeting with Boss" -> High priority, prepare files, dress code).
- **User History**: Use the provided recent behaviors to tailor suggestions.

**2. Multi-Device Synergy:**
Analyze the scenario and distribute tasks intelligently:
- **Meeting**: Phone (notify), PC (files), Car (nav), Watch (reminders).
- **Travel**: Phone (ticket), Watch (gate), Home (security).
- **Deep Work**: PC (focus), Phone (DND), Home (ambiance).

**3. Output Requirement:**
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

**Input Analysis:**
Current Time: ${getShanghaiTime()}
User Input: "${input}"
User Context: ${userContext}

**Generation Guidelines:**
- **Tone**: Warm, empathetic, efficient (Simplified Chinese).
- **Proactive**: Don't just remind; prepare.
`;

        let result = null;
        let provider = null;

        // Try Moonshot first
        if (moonshotKey) {
            try {
                const cleanKey = moonshotKey.trim().replace(/[\r\n\s]/g, '');
                console.log(`[Moonshot] Preparing request. Key length: ${cleanKey.length}`);
                console.log(`[Moonshot] Key start/end: ${cleanKey.substring(0, 5)}...${cleanKey.substring(cleanKey.length - 4)}`);
                
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
                    console.log("[Moonshot] Success. Tokens used:", data.usage);
                    const content = data.choices[0].message.content;
                    if (content) {
                        // Handle potential markdown code blocks
                        const jsonStr = content.replace(/^```json\n|\n```$/g, '').trim();
                        result = JSON.parse(jsonStr);
                        provider = 'moonshot';
                    }
                } else {
                    const errText = await response.text();
                    console.error(`[Moonshot] API Error: Status ${response.status}`);
                    console.error(`[Moonshot] Headers:`, Object.fromEntries(response.headers.entries()));
                    console.error(`[Moonshot] Body: ${errText}`);
                }
            } catch (e) {
                console.error("Moonshot execution error:", e);
            }
        }

        // Fallback to OpenAI if Moonshot failed
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
                        temperature: 0.3
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const content = data.choices[0].message.content;
                    if (content) {
                        result = JSON.parse(content);
                        provider = 'openai';
                    }
                } else {
                    const err = await response.text();
                    console.error("OpenAI API failed:", response.status, err);
                }
            } catch (e) {
                console.error("OpenAI error:", e);
            }
        }

        if (!result) {
            return Response.json({ error: 'All AI providers failed. Please check API keys.' }, { status: 500 });
        }

        result._meta = { provider };
        return Response.json(result);

    } catch (error) {
        console.error("Function error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});