import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import OpenAI from 'npm:openai';

export default async function handler(req) {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
        return Response.json({ 
            error: 'Configuration Error', 
            details: 'MOONSHOT_API_KEY is missing. Please set it in Settings -> Environment Variables.' 
        }, { status: 500 });
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://api.moonshot.cn/v1",
    });

    try {
        const { input } = await req.json();
        const now = new Date();

        const completion = await openai.chat.completions.create({
            model: "kimi-k2-turbo-preview", // Updated to Kimi's model
            messages: [
                {
                    role: "system",
                    content: `You are SoulSentry, an advanced AI assistant for device coordination and task planning.
                    Analyze the user's input and generate a structured plan.
                    
                    IMPORTANT: All generated text (titles, descriptions, strategies, content, methods) MUST BE IN SIMPLIFIED CHINESE (简体中文).
                    
                    Return ONLY a JSON object in this EXACT structure:
                    {
                        "devices": {
                            "phone": { "strategies": [{"time": "HH:MM", "method": "string", "content": "string", "priority": "high|medium|low"}] },
                            "watch": { "strategies": [] },
                            "glasses": { "strategies": [] },
                            "car": { "strategies": [] },
                            "home": { "strategies": [] },
                            "pc": { "strategies": [] }
                        },
                        "timeline": [
                            {"time": "HH:MM", "title": "string", "desc": "string", "icon": "string (emoji)", "highlight": boolean}
                        ],
                        "automations": [
                            {"title": "string", "desc": "string", "status": "active|ready|monitoring|pending", "icon": "string (emoji)"}
                        ]
                    }
                    
                    Generate realistic strategies for each device based on the input context.
                    For automations, identify tasks that can be automated (booking, navigation, reminders, file prep).
                    Ensure all content is friendly, concise, and in Simplified Chinese.
                    `
                },
                {
                    role: "user",
                    content: `User Input: "${input}"\nCurrent Time: ${now.toLocaleString()}`
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.6
        });

        const result = JSON.parse(completion.choices[0].message.content);
        return Response.json(result);

    } catch (error) {
        console.error('AI Analysis Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}