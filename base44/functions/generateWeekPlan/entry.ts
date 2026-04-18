import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const getMockPlan = (startDate, errorDetails) => ({
    summary: "演示计划（API调用失败）。请检查API Key或网络。",
    theme: "演示周",
    is_demo: true,
    error_details: errorDetails,
    plan_start_date: startDate,
    events: [
        { day_index: 0, title: "深度工作：代码研发", time: "09:00", type: "work", icon: "💻" },
        { day_index: 1, title: "团队同步会议", time: "14:00", type: "meeting", icon: "👥" },
        { day_index: 2, title: "健身房锻炼", time: "18:00", type: "focus", icon: "💪" },
        { day_index: 4, title: "项目评审", time: "10:00", type: "work", icon: "📊" }
    ],
    device_strategies: { phone: "工作时间开启专注模式", watch: "启用健康监测", glasses: "通知静音", car: "通勤播放列表", home: "放松氛围灯光", pc: "开发环境配置" },
    automations: [{ title: "晨间唤醒", description: "开启灯光，播放新闻", icon: "☀️", status: "active" }],
    stats: { focus_hours: 20, meetings: 5, travel_days: 0 }
});

function parseJSON(content) {
  const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s !== -1 && e > s) return JSON.parse(content.slice(s, e + 1));
  throw new Error('Failed to parse JSON');
}

Deno.serve(async (req) => {
    try {
        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
        }

        const base44 = createClientFromRequest(req);
        try {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        } catch (e) {
            return Response.json({ error: 'Authentication failed' }, { status: 401 });
        }

        const body = await req.json().catch(() => null);
        if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });

        const { input, startDate, currentDate } = body;
        const today = currentDate || new Date().toISOString().split('T')[0];
        const viewStart = startDate || today;

        if (!input) return Response.json({ error: 'Input is required' }, { status: 400 });

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json(getMockPlan(viewStart, "MOONSHOT_API_KEY not set"));

        const systemPrompt = `You are an expert personal planner AI. Parse user input and generate a structured weekly plan.
CRITICAL RULES:
1. Output MUST be in Simplified Chinese.
2. Today is: ${today}. User is viewing week starting: ${viewStart} (Monday).
3. Calculate plan_start_date (Monday of target week) from temporal keywords. Default to ${viewStart}.
4. day_index 0=Monday, 6=Sunday. Time format: "HH:MM" 24-hour.
5. Return ONLY JSON:
{
  "plan_start_date": "YYYY-MM-DD",
  "summary": "string", "theme": "string",
  "events": [{"date":"YYYY-MM-DD","day_index":0,"title":"string","time":"HH:MM","type":"work|meeting|travel|focus|rest|other","icon":"emoji"}],
  "device_strategies": {"phone":"string","watch":"string",...},
  "automations": [{"title":"string","description":"string","icon":"string","status":"active|pending"}],
  "stats": {"focus_hours":0,"meetings":0,"travel_days":0}
}`;

        try {
            const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
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

            if (!res.ok) throw new Error(`Kimi error: ${res.status}`);
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            const plan = parseJSON(content);
            if (!plan.events || !Array.isArray(plan.events)) throw new Error("Invalid structure");
            return Response.json(plan);
        } catch (err) {
            console.error('[generateWeekPlan] Kimi failed:', err.message);
            return Response.json(getMockPlan(viewStart, err.message));
        }
    } catch (error) {
        console.error('Critical error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});