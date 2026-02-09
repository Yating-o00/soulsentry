import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai@4.28.0';

const openaiKey = Deno.env.get("OPENAI_API_KEY");
const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");

// Helper to create OpenAI client
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

        const systemPrompt = `You are an expert personal planner AI. Your goal is to parse user input about their week and generate a structured plan.
        
        Current context:
        - Start date of the week: ${startDate || new Date().toISOString().split('T')[0]}
        
        You need to extract/generate:
        1. events: A list of specific events mentioned or implied.
        2. device_strategies: For each device (phone, watch, glasses, car, home, pc), define a specific strategy/role for this week based on the user's intent.
        3. automations: Suggested automated tasks to help achieve the user's goals.
        4. summary: A brief summary of the week's theme.
        5. stats: Estimated counts for focus sessions, travel, etc.

        IMPORTANT: Return ONLY valid JSON. No markdown formatting, no code blocks. Just the raw JSON object.
        
        JSON Structure:
        {
            "summary": "string",
            "theme": "string",
            "events": [
                {
                    "day_index": number (0-6),
                    "title": "string",
                    "time": "string",
                    "type": "work" | "meeting" | "travel" | "focus" | "rest" | "other",
                    "icon": "emoji string"
                }
            ],
            "device_strategies": {
                "phone": "string",
                "watch": "string",
                "glasses": "string",
                "car": "string",
                "home": "string",
                "pc": "string"
            },
            "automations": [
                {
                    "title": "string",
                    "description": "string",
                    "icon": "emoji string",
                    "status": "active" | "pending"
                }
            ],
            "stats": {
                "focus_hours": number,
                "meetings": number,
                "travel_days": number
            }
        }`;

        // Strategy: Try OpenAI first, fallback to Moonshot
        let aiResponse = null;
        let usedProvider = null;
        const errors = [];

        const providers = [];
        // Prioritize Moonshot
        if (moonshotKey) providers.push('moonshot');
        if (openaiKey) providers.push('openai');

        if (providers.length === 0) {
            return Response.json({ error: "No AI API keys configured. Please set OPENAI_API_KEY or MOONSHOT_API_KEY." }, { status: 500 });
        }

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
                break; // Success!
            } catch (err) {
                console.error(`${provider.name} failed:`, err.message);
                errors.push(`${provider.name}: ${err.message}`);
            }
        }

        if (!aiResponse) {
            const errorDetails = errors.join(' | ');
            console.error("All providers failed:", errorDetails);
            return Response.json({ error: `AI Processing Failed: ${errorDetails}` }, { status: 500 });
        }

        console.log(`Response received from ${usedProvider}`);

        let plan;
        try {
            const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            plan = JSON.parse(cleaned);
        } catch (e) {
            console.error("Failed to parse AI response:", e);
            console.log("Raw response:", aiResponse);
            return Response.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        // Ensure required fields
        if (!plan.events) plan.events = [];
        if (!plan.device_strategies) plan.device_strategies = {};
        if (!plan.automations) plan.automations = [];
        
        return Response.json(plan);

    } catch (error) {
        console.error('Critical error in generateWeekPlan:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});