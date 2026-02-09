import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai@4.28.0';

const openaiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
const moonshotKey = Deno.env.get("MOONSHOT_API_KEY")?.trim();

const getMockPlan = (startDate, errorDetails) => ({
    summary: "演示计划（API调用失败）。请检查API Key或网络。",
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
        
        JSON Structure required:
        {
            "summary": "string",
            "theme": "string",
            "events": [{ "day_index": number (0-6), "title": "string", "time": "string", "type": "work"|"meeting"|"travel"|"focus"|"rest"|"other", "icon": "emoji" }],
            "device_strategies": { "phone": "string", "watch": "string", ... },
            "automations": [{ "title": "string", "description": "string", "icon": "string", "status": "active"|"pending" }],
            "stats": { "focus_hours": number, "meetings": number, "travel_days": number }
        }
        
        Return ONLY the JSON object. No markdown formatting.`;

        // Define strategies
        const strategies = [];

        // 1. Moonshot Strategy
        if (moonshotKey) {
            strategies.push({
                name: "Moonshot",
                run: async () => {
                    const client = new OpenAI({ 
                        apiKey: moonshotKey, 
                        baseURL: "https://api.moonshot.ai/v1" 
                    });
                    const completion = await client.chat.completions.create({
                        model: "moonshot-v1-8k",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: input }
                        ]
                    });
                    return completion.choices[0].message.content;
                }
            });
        }

        // 2. OpenAI Strategy
        if (openaiKey) {
            strategies.push({
                name: "OpenAI",
                run: async () => {
                    const client = new OpenAI({ apiKey: openaiKey });
                    const completion = await client.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: input }
                        ],
                        response_format: { type: "json_object" }
                    });
                    return completion.choices[0].message.content;
                }
            });
        }

        // 3. Base44 InvokeLLM Strategy (Fallback)
        strategies.push({
            name: "InvokeLLM",
            run: async () => {
                const res = await base44.integrations.Core.InvokeLLM({
                    prompt: `${systemPrompt}\n\nUser Input: ${input}`,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            summary: { type: "string" },
                            theme: { type: "string" },
                            events: { type: "array", items: { type: "object", additionalProperties: true } },
                            device_strategies: { type: "object", additionalProperties: true },
                            automations: { type: "array", items: { type: "object", additionalProperties: true } },
                            stats: { type: "object", additionalProperties: true }
                        }
                    }
                });
                return JSON.stringify(res);
            }
        });

        // Execute strategies sequentially until one succeeds
        const errors = [];
        for (const strategy of strategies) {
            console.log(`Trying strategy: ${strategy.name}...`);
            try {
                const rawResponse = await strategy.run();
                if (!rawResponse) throw new Error("Empty response");

                // Try to parse
                let plan;
                try {
                    // Clean up markdown code blocks if present
                    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                    plan = JSON.parse(cleaned);
                    
                    // Basic validation
                    if (!plan.events || !Array.isArray(plan.events)) {
                        throw new Error("Invalid structure: missing events array");
                    }
                    
                    console.log(`Success with ${strategy.name}`);
                    return Response.json(plan); // SUCCESS!
                } catch (parseError) {
                    console.error(`${strategy.name} parsing failed:`, parseError.message);
                    console.log("Raw response:", rawResponse.substring(0, 200) + "...");
                    throw new Error(`Parsing failed: ${parseError.message}`);
                }
            } catch (err) {
                console.error(`${strategy.name} execution failed:`, err.message);
                errors.push(`${strategy.name}: ${err.message}`);
            }
        }

        // If we get here, all strategies failed
        console.log("All strategies failed. Falling back to mock.");
        return Response.json(getMockPlan(startDate, errors.join(" | ")));

    } catch (error) {
        console.error('Critical error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});