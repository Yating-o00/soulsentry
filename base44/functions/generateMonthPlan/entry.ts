import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { input, startDate, behaviors } = body;

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

        const behaviorSummary = behaviors && behaviors.length > 0 ? behaviors.map(b => 
            `- Event: ${b.event_type}, Category: ${b.category || 'General'}, Time: ${b.hour_of_day}h, Day: ${b.day_of_week}, Response: ${b.response_time_seconds}s`
        ).join('\n') : "No historical behavior data available.";

        const prompt = `
        Role: You are "Soul Planner", an expert AI life coach specializing in Smart Goal Decomposition and Behavioral Science.
        
        Task: 
        1. DECOMPOSE the user's macro goal into a concrete, actionable Monthly Plan.
        2. DYNAMICALLY ADJUST based on User's Behavioral Data.

        User Input: "${input}"
        Month Context: ${startDate}
        
        User Behavioral Data:
        ${behaviorSummary}

        Output a JSON with this structure:
        {
            "theme": "A short inspiring theme",
            "summary": "Concise summary of plan decomposition",
            "stats": { "focus_hours": number, "milestones_count": number },
            "weeks_breakdown": [{ "week_label": "Week N (Phase)", "focus": "Main focus", "key_events": ["Step 1", "Step 2"] }],
            "key_milestones": [{ "title": "Milestone", "deadline": "YYYY-MM-DD", "type": "work/personal/health" }],
            "strategies": { "work_life_balance": "strategy...", "energy_management": "advice...", "behavioral_adjustment": "adaptation note..." }
        }
        
        Language: Simplified Chinese. Return ONLY JSON.`;

        const schema = {
            type: "object",
            properties: {
                theme: { type: "string" },
                summary: { type: "string" },
                stats: { type: "object", properties: { focus_hours: { type: "number" }, milestones_count: { type: "number" } } },
                weeks_breakdown: { type: "array", items: { type: "object", additionalProperties: true } },
                key_milestones: { type: "array", items: { type: "object", additionalProperties: true } },
                strategies: { type: "object", additionalProperties: true }
            }
        };

        const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model: "kimi-k2-turbo-preview",
                messages: [
                    { role: "system", content: `你是一个智能月度规划助手。请严格按JSON格式返回。\n${JSON.stringify(schema)}` },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Kimi API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const planData = JSON.parse(cleaned);

        return Response.json({ ...planData, plan_start_date: startDate }, { headers: { 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        console.error("generateMonthPlan error:", error?.message || error);
        return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
});