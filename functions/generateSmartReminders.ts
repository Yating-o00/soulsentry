import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai';

export default Deno.serve(async (req) => {
    // Handle CORS
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
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const body = await req.json();
        const { task, behaviors } = body;

        const apiKey = Deno.env.get("MOONSHOT_API_KEY") || Deno.env.get("OPENAI_API_KEY");
        const baseURL = Deno.env.get("MOONSHOT_API_KEY") ? "https://api.moonshot.cn/v1" : undefined;

        if (!apiKey) {
            return Response.json({ error: "No AI API Key configured" }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL
        });

        const prompt = `你是一个时间管理专家。分析用户的约定完成行为数据，为新约定推荐最佳的提醒时间。

约定信息：
- 标题：${task.title}
- 描述：${task.description || '无'}
- 类别：${task.category}
- 优先级：${task.priority}
- 原计划时间：${task.reminder_time || '未设置'}

用户历史行为数据（最近100条）：
${behaviors.length > 0 ? behaviors.map(b => `
- 事件类型：${b.event_type}
- 类别：${b.category || '未知'}
- 时间：${b.hour_of_day}点，星期${b.day_of_week}
`).join('\n') : '暂无历史数据'}

请分析：
1. 用户在什么时间段对该类别约定响应最快？
2. 用户在哪天完成该类别约定效率最高？
3. 考虑约定优先级，推荐3个最佳提醒时间。**注意：推荐的时间必须晚于当前时间（${new Date().toISOString()}），严禁推荐过去的时间。**
4. 给出推荐理由

请生成 JSON 响应：
{
    "optimal_time_slot": "最佳时间段（如：早上9-11点）",
    "best_day_pattern": "最佳日期模式（如：工作日、周末等）",
    "suggestions": [
        {
            "datetime": "ISO格式时间字符串",
            "reason": "推荐理由",
            "confidence": "high/medium/low"
        }
    ],
    "insights": ["洞察1", "洞察2"]
}
`;

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful assistant that outputs JSON." },
                { role: "user", content: prompt }
            ],
            model: Deno.env.get("MOONSHOT_API_KEY") ? "moonshot-v1-8k" : "gpt-4o-mini",
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        let result;
        try {
            result = JSON.parse(content);
        } catch (e) {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) result = JSON.parse(match[0]);
            else throw new Error("Invalid JSON response");
        }

        return Response.json(result, { headers: { 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        console.error("Smart Reminder Error:", error);
        return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
});