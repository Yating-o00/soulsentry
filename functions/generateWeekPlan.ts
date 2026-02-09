import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai@4.28.0';

const openaiKey = Deno.env.get("OPENAI_API_KEY");
const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");

// Mock data for demo/testing when keys fail
const getMockPlan = (startDate) => ({
    summary: "This is a DEMO plan (API keys are missing or invalid). Focus on health and coding.",
    theme: "Demo Week",
    events: [
        { day_index: 0, title: "Deep Work: Coding", time: "09:00", type: "work", icon: "💻" },
        { day_index: 1, title: "Team Sync", time: "14:00", type: "meeting", icon: "👥" },
        { day_index: 2, title: "Gym Session", time: "18:00", type: "focus", icon: "💪" },
        { day_index: 4, title: "Project Review", time: "10:00", type: "work", icon: "📊" }
    ],
    device_strategies: {
        phone: "Focus mode during work hours",
        watch: "Health tracking enabled",
        glasses: "Notifications off",
        car: "Commute playlist",
        home: "Relaxing ambiance",
        pc: "Development environment"
    },
    automations: [
        { title: "Morning Routine", description: "Turn on lights, play news", icon: "☀️", status: "active" }
    ],
    stats: { focus_hours: 20, meetings: 5, travel_days: 0 }
});

const createAIClient = (provider) => {
    if (provider === 'openai' && openaiKey) {
        return {
            client: new OpenAI({ apiKey: openaiKey }),
            model: "gpt-4o-mini",
            name: "OpenAI"
        };
    }
    if (provider === 'moonshot' && moonshotKey) {
        return {
            client: new OpenAI({ 
                apiKey: moonshotKey, 
                baseURL: "https://api.moonshot.cn/v1" 
            }),
            model: "moonshot-v1-8k",
            name: "Moonshot"
        };
    }
    return null;
};

Deno.serve(async (req) => {
    try {
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                }
            });
        }

        const base44 = createClientFromRequest(req);
        
        try {
            const user = await base44.auth.me();
            if (!user) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
        } catch (e) {
            return Response.json({ error: 'Authentication failed' }, { status: 401 });
        }

        let body;
        try {
            body = await req.json();
        } catch (e) {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { input, startDate } = body;
        console.log(`Generating plan for: ${input?.substring(0, 50)}...`);

        if (!input) {
            return Response.json({ error: 'Input is required' }, { status: 400 });
        }

        // Check if we should use mock data (if explicit request or strictly no keys)
        const useMock = input.toLowerCase().includes("demo") || (!openaiKey && !moonshotKey);
        
        const systemPrompt = `You are an expert personal planner AI. Your goal is to parse user input about their week and generate a structured plan.
        
        Current context:
        - Start date of the week: ${startDate || new Date().toISOString().split('T')[0]}
        
        JSON Structure required:
        {
            "summary": "string",
            "theme": "string",
            "events": [{ "day_index": number (0-6), "title": "string", "time": "string", "type": "work"|"meeting"|"travel"|"focus"|"rest"|"other", "icon": "emoji" }],
            "device_strategies": { "phone": "string", "watch": "string", ... },
            "automations": [{ "title": "string", "description": "string", "icon": "string", "status": "active"|"pending" }],
            "stats": { "focus_hours": number, "meetings": number, "travel_days": number }
        }`;

        const providers = [];
        if (moonshotKey) providers.push('moonshot');
        if (openaiKey) providers.push('openai');

        let aiResponse = null;
        let usedProvider = null;
        const errors = [];

        if (!useMock && providers.length > 0) {
            for (const providerName of providers) {
                const provider = createAIClient(providerName);
                if (!provider) continue;

                console.log(`Attempting generation with ${provider.name}...`);
                try {
                    const completion = await provider.client.chat.completions.create({
                        model: provider.model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: input }
                        ],
                        response_format: providerName === 'openai' ? { type: "json_object" } : undefined
                    });

                    aiResponse = completion.choices[0].message.content;
                    usedProvider = provider.name;
                    break;
                } catch (err) {
                    console.error(`${provider.name} failed:`, err.message);
                    errors.push(`${provider.name}: ${err.message}`);
                }
            }
        }

        if (!aiResponse) {
            if (useMock || errors.length > 0) {
                console.log("Using fallback/mock plan due to API failure or demo request.");
                return Response.json(getMockPlan(startDate));
            }
            
            const errorDetails = errors.join(' | ');
            return Response.json({ 
                error: `AI Processing Failed. Please check your API keys (OPENAI_API_KEY or MOONSHOT_API_KEY). Details: ${errorDetails}` 
            }, { status: 500 });
        }

        console.log(`Response received from ${usedProvider}`);

        let plan;
        try {
            const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            plan = JSON.parse(cleaned);
        } catch (e) {
            console.error("Failed to parse AI response:", e);
            // Fallback to mock if parsing fails
            return Response.json(getMockPlan(startDate));
        }

        return Response.json(plan);

    } catch (error) {
        console.error('Critical error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});