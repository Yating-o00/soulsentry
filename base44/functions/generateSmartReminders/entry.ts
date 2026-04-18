import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
        const { task, behaviors } = body;

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json({ error: "MOONSHOT_API_KEY not set" }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });

        const prompt = `你是一个时间管理专家。分析用户的约定完成行为数据，为新约定推荐最佳的提醒时间。

约定信息：
- 标题：${task.title}
- 描述：${task.description || '无'}
- 类别：${task.category}
- 优先级：${task.priority}
- 原计划时间：${task.reminder_time || '未设置'}

用户历史行为数据（最近100条）：
${behaviors.length > 0 ? behaviors.map(b => `- 事件类型：${b.event_type}, 类别：${b.category || '未知'}, 时间：${b.hour_of_day}点, 星期${b.day_of_week}`).join('\n') : '暂无历史数据'}

推荐的时间必须晚于当前时间（${new Date().toISOString()}），严禁推荐过去的时间。

返回JSON：
{
  "optimal_time_slot": "最佳时间段",
  "best_day_pattern": "最佳日期模式",
  "suggestions": [{"datetime": "ISO时间", "reason": "理由", "confidence": "high/medium/low"}],
  "insights": ["洞察1", "洞察2"]
}`;

        const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
            body: JSON.stringify({
                model: "kimi-k2-turbo-preview",
                messages: [
                    { role: "system", content: "你是一个智能助手，必须返回JSON格式。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!res.ok) throw new Error(`Kimi API error: ${res.status}`);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const result = parseJSON(content);
        return Response.json(result, { headers: { 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        console.error("Smart Reminder Error:", error);
        return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
});