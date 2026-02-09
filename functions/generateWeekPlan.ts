import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai@4.28.0';

const openaiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
const moonshotKey = Deno.env.get("MOONSHOT_API_KEY")?.trim();

// Mock data for demo/testing when all methods fail
const getMockPlan = (startDate, errorDetails) => ({
    summary: "演示计划（API密钥无效或缺失）。重点关注健康与研发。",
    theme: "演示周",
    is_demo: true,
    error_details: errorDetails,
    events: [
        { day_index: 0, title: "深度工作：代码研发", time: "09:00", type: "work", icon: "💻" },
        { day_index: 1, title: "团队同步会议", time: "14:00", type: "meeting", icon: "👥" },
        { day_index: 2, title: "健身房锻炼", time: "18:00", type: "focus", icon: "💪" },
        { day_index: 4, title: "项目评审", time: "10:00", type: "work", icon: "📊" }
    ],
    device_strategies: {
        phone: "工作时间开启专注模式",
        watch: "启用健康监测",
        glasses: "通知静音",
        car: "通勤播放列表",
        home: "放松氛围灯光",
        pc: "开发环境配置"
    },
    automations: [
        { title: "晨间唤醒", description: "开启灯光，播放新闻", icon: "☀️", status: "active" }
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
                baseURL: "https://api.moonshot.ai/v1" 
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

        // Check if we should force mock (for debugging)
        const forceMock = input.toLowerCase().includes("force_demo");
        
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

        // 1. Try configured providers (Moonshot / OpenAI)
        if (!forceMock && providers.length > 0) {
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

        // 2. Try Base44 InvokeLLM (Platform Integration) if providers failed
        if (!forceMock && !aiResponse) {
            console.log("Attempting generation with Base44 InvokeLLM (Fallback)...");
            try {
                const response = await base44.integrations.Core.InvokeLLM({
                    prompt: `${systemPrompt}\n\nUser Input: ${input}\n\nReturn ONLY the JSON object.`,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            summary: { type: "string" },
                            theme: { type: "string" },
                            events: { 
                                type: "array", 
                                items: { 
                                    type: "object",
                                    properties: {
                                        day_index: { type: "number" },
                                        title: { type: "string" },
                                        time: { type: "string" },
                                        type: { type: "string" },
                                        icon: { type: "string" }
                                    }
                                }
                            },
                            device_strategies: { type: "object", additionalProperties: { type: "string" } },
                            automations: { 
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        title: { type: "string" },
                                        description: { type: "string" },
                                        icon: { type: "string" },
                                        status: { type: "string" }
                                    }
                                }
                            },
                            stats: { 
                                type: "object",
                                properties: {
                                    focus_hours: { type: "number" },
                                    meetings: { type: "number" },
                                    travel_days: { type: "number" }
                                }
                            }
                        }
                    }
                });
                
                // InvokeLLM returns the object directly if json schema is used
                aiResponse = JSON.stringify(response); 
                usedProvider = "Base44 InvokeLLM";
            } catch (err) {
                console.error("InvokeLLM failed:", err.message);
                errors.push(`InvokeLLM: ${err.message}`);
            }
        }

        if (!aiResponse) {
            console.log("Using fallback/mock plan due to API failure or demo request.");
            const errorDetails = errors.join(' | ');
            return Response.json(getMockPlan(startDate, errorDetails));
        }

        console.log(`Response received from ${usedProvider}`);

        let plan;
        try {
            const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            plan = JSON.parse(cleaned);
        } catch (e) {
            console.error("Failed to parse AI response:", e);
            // Fallback to mock if parsing fails
            return Response.json(getMockPlan(startDate, "Failed to parse AI response"));
        }

        return Response.json(plan);

    } catch (error) {
        console.error('Critical error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});