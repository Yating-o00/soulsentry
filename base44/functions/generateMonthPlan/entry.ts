import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { format, endOfMonth } from 'npm:date-fns@3.6.0';

const MOCK_PLAN = {
    theme: "演示月度：全面突破",
    summary: "本月将专注于核心项目的突破性进展，同时兼顾个人健康与学习。",
    stats: { focus_hours: 120, milestones_count: 5 },
    weeks_breakdown: [
        { week_label: "第一周 (启动)", focus: "项目启动与需求确认", key_events: ["需求评审会", "技术方案制定"] },
        { week_label: "第二周 (攻坚)", focus: "核心功能开发", key_events: ["核心模块编码", "晨跑3次"] },
        { week_label: "第三周 (测试)", focus: "功能测试与修复", key_events: ["集成测试", "性能优化"] },
        { week_label: "第四周 (交付)", focus: "产品上线与总结", key_events: ["产品发布会", "月度复盘"] }
    ],
    key_milestones: [
        { title: "完成MVP版本开发", deadline: "2024-03-15", type: "work" },
        { title: "体重减重2kg", deadline: "2024-03-31", type: "health" }
    ],
    strategies: { work_life_balance: "采用番茄工作法保持专注", energy_management: "保证每天7小时睡眠" },
    is_demo: true
};

function parseJSON(content) {
  const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s !== -1 && e > s) return JSON.parse(content.slice(s, e + 1));
  throw new Error('Failed to parse JSON');
}

export default Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });

        const body = await req.json();
        const { input, startDate, behaviors } = body;
        const monthStart = new Date(startDate);

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json({ ...MOCK_PLAN, plan_start_date: startDate }, { headers: { 'Access-Control-Allow-Origin': '*' } });

        const behaviorSummary = behaviors && behaviors.length > 0 ? behaviors.map(b =>
            `- Event: ${b.event_type}, Category: ${b.category || 'General'}, Time: ${b.hour_of_day}h, Day: ${b.day_of_week}`
        ).join('\n') : "No historical behavior data available.";

        const prompt = `Role: You are "Soul Planner", an expert AI life coach.
Task: Decompose user's macro goal into an actionable Monthly Plan, adjusted by behavioral data.
User Input: "${input}"
Month: ${format(monthStart, 'yyyy-MM')}
User Behavioral Data (Recent): ${behaviorSummary}

Return JSON:
{
  "theme": "string", "summary": "string",
  "stats": {"focus_hours": number, "milestones_count": number},
  "weeks_breakdown": [{"week_label": "string", "focus": "string", "key_events": ["string"]}],
  "key_milestones": [{"title": "string", "deadline": "YYYY-MM-DD", "type": "work/personal/health"}],
  "strategies": {"work_life_balance": "string", "energy_management": "string", "behavioral_adjustment": "string"}
}
Constraint: Realistic plan, concrete milestones, RETURN ONLY JSON.`;

        try {
            const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
                body: JSON.stringify({
                    model: "kimi-k2-turbo-preview",
                    messages: [
                        { role: "system", content: "You are a helpful assistant that outputs JSON only." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                })
            });
            if (!res.ok) throw new Error(`Kimi error: ${res.status}`);
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            const planData = parseJSON(content);
            return Response.json({ ...planData, plan_start_date: startDate }, { headers: { 'Access-Control-Allow-Origin': '*' } });
        } catch (apiError) {
            console.error("Kimi API Failed:", apiError);
            return Response.json({ ...MOCK_PLAN, plan_start_date: startDate, is_demo: true, error: apiError.message }, { headers: { 'Access-Control-Allow-Origin': '*' } });
        }
    } catch (error) {
        console.error("Generate Month Plan Error:", error);
        return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
});