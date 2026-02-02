import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai@^4.28.0';

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

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            console.error("Moonshot API Key is missing");
            return Response.json({ error: 'Moonshot API Key not configured' }, { status: 500 });
        }

        // Fetch User Context for Personalization
        let userContext = "";
        try {
            // Fetch recent behaviors and tasks for context
            // Using a try-catch block for the entity calls to prevent failure if entities don't exist yet
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
            // Continue without context if fetching fails
        }

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: "https://api.moonshot.cn/v1",
        });

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

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: input }
        ];

        const completion = await client.chat.completions.create({
            model: "kimi-k2-turbo-preview",
            messages: messages,
            temperature: 0.6,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        if (!content) {
             throw new Error("Empty response from AI");
        }

        const result = JSON.parse(content);
        return Response.json(result);

    } catch (error) {
        console.error("Function error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});