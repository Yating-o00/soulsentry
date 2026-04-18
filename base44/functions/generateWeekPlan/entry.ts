import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { input, startDate, currentDate } = body;
        const today = currentDate || new Date().toISOString().split('T')[0];
        const viewStart = startDate || today;

        if (!input) return Response.json({ error: 'Input is required' }, { status: 400 });

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

        const systemPrompt = `You are an expert personal planner AI. Your goal is to parse user input about their week and generate a structured plan.
        
        CRITICAL RULES:
        1. LANGUAGE: Output MUST be in Simplified Chinese (简体中文).
        2. DATE CONTEXT: Today is: ${today}. The user is currently viewing the week starting: ${viewStart} (Monday).
        3. INTELLIGENT DATE ALIGNMENT: Calculate plan_start_date (MUST be Monday of target week) based on Today and input.
        4. EVENT MAPPING: day_index 0 = Monday, day_index 6 = Sunday.
        5. TIME FORMAT: Use "HH:MM" 24-hour format.
        
        REQUIRED JSON OUTPUT FORMAT:
        {
            "plan_start_date": "YYYY-MM-DD",
            "summary": "string (in Chinese)",
            "theme": "string (in Chinese)",
            "events": [{ "date": "YYYY-MM-DD", "day_index": number, "title": "string", "time": "HH:MM", "type": "work"|"meeting"|"travel"|"focus"|"rest"|"other", "icon": "emoji" }],
            "device_strategies": { "phone": "string", "watch": "string", ... },
            "automations": [{ "title": "string", "description": "string", "icon": "string", "status": "active"|"pending" }],
            "stats": { "focus_hours": number, "meetings": number, "travel_days": number }
        }`;

        const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model: "kimi-k2-turbo-preview",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: input }
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
        const plan = JSON.parse(cleaned);

        if (!plan.events || !Array.isArray(plan.events)) {
            throw new Error("Invalid structure: missing events array");
        }

        return Response.json(plan);
    } catch (error) {
        console.error('generateWeekPlan error:', error?.message || error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});