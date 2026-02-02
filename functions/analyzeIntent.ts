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

        // Fetch User Context for Personalization
        let userContext = "";
        try {
            const [behaviors, recentTasks] = await Promise.all([
                base44.entities.UserBehavior.list('-created_date', 10),
                base44.entities.Task.list('-created_date', 5)
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
- **User History**: Use the provided recent behaviors to tailor suggestions (e.g., if user prioritizes 'work', ensure work tasks are highlighted).

**2. Multi-Device Synergy (The SoulSentry Core):**
Analyze the scenario and distribute tasks intelligently:
- **Meeting Scenario**: 
  - **Phone**: Primary notification, calendar view.
  - **PC**: Auto-open relevant files/software 5 mins before.
  - **Car**: Navigation to venue, traffic monitoring.
  - **Watch**: Discreet time/agenda reminders during meeting.
  - **Glasses**: AR name tags or key talking points.
- **Travel Scenario**:
  - **Phone**: E-ticket, itinerary.
  - **Watch**: Boarding gate, flight status.
  - **Home**: Security mode, thermostat adjustment.
- **Deep Work Scenario**:
  - **PC**: Focus mode, block distractions.
  - **Phone**: DND mode, only urgent calls.
  - **Home**: Ambient lighting, white noise.

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
- **Precision**: Use specific times and clear actions.
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