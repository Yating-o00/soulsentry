import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const getShanghaiTime = () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

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
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const tasks = await base44.entities.Task.filter({ status: ['pending', 'in_progress'] }, '-priority', 20);
        const notes = await base44.entities.Note.list('-created_date', 5);

        const taskSummary = tasks.map(t => `- [${t.priority}] ${t.title} (Due: ${t.end_time || 'None'})`).join('\n');
        const noteSummary = notes.map(n => `- ${n.content.substring(0, 100)}...`).join('\n');

        const systemPrompt = `You are "SoulSentry" (心栈), a mindful personal companion.
Generate a "Daily Briefing" based on tasks and notes.

**Input Data:**
- Current Time: ${getShanghaiTime()}
- User Name: ${user.full_name || 'Traveler'}
- Tasks:\n${taskSummary}
- Recent Thoughts:\n${noteSummary}

**Instructions:**
1. Analyze: Short-term Focus (urgent, today) vs Long-term/Strategic (recurring, aspirations).
2. Synthesize: Warm, encouraging narrative. Don't just list items.
3. Return JSON:
{"title":"string","short_term_narrative":"string","long_term_narrative":"string","mindful_tip":"string"}

Tone: Warm, calm, supportive. Language: Simplified Chinese.`;

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            return Response.json({
                title: "开启充满活力的一天",
                short_term_narrative: "今天有一些待办事项需要处理，请查看任务列表。",
                long_term_narrative: "别忘了回顾你的笔记，保持长远的目标感。",
                mindful_tip: "深呼吸，专注于当下。"
            });
        }

        try {
            const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
                body: JSON.stringify({
                    model: "kimi-k2-turbo-preview",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: "Generate my daily briefing." }
                    ],
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) throw new Error(`Kimi error: ${response.status}`);
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            const result = parseJSON(content);
            return Response.json(result);
        } catch (e) {
            console.error("Kimi failed:", e);
            return Response.json({
                title: "开启充满活力的一天",
                short_term_narrative: "今天有一些待办事项需要处理，请查看任务列表。",
                long_term_narrative: "别忘了回顾你的笔记，保持长远的目标感。",
                mindful_tip: "深呼吸，专注于当下。"
            });
        }
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});