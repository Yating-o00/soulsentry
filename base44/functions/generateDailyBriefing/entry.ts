import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const getShanghaiTime = () => {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const tasks = await base44.entities.Task.filter({
            status: ['pending', 'in_progress']
        }, '-priority', 20);

        const notes = await base44.entities.Note.list('-created_date', 5);

        const taskSummary = tasks.map(t => `- [${t.priority}] ${t.title} (Due: ${t.end_time || 'None'})`).join('\n');
        const noteSummary = notes.map(n => `- ${n.content.substring(0, 100)}...`).join('\n');

        const systemPrompt = `
You are "SoulSentry" (心栈), a mindful personal companion.
Generate a "Daily Briefing" based on user's tasks and notes.

**Input Data:**
- **Current Time:** ${getShanghaiTime()}
- **User Name:** ${user.full_name || 'Traveler'}
- **Tasks:** 
${taskSummary}
- **Recent Thoughts (Notes):**
${noteSummary}

**Instructions:**
1. Analyze tasks and notes. Distinguish short-term focus vs long-term/strategic items.
2. Write a natural, warm, encouraging briefing.
3. Return valid JSON:
{
  "title": "A short positive title",
  "short_term_narrative": "Focus on what needs to be done today",
  "long_term_narrative": "Connect notes to bigger picture goals",
  "mindful_tip": "One-sentence actionable mindfulness tip"
}

**Tone:** Warm, calm, supportive. Language: Simplified Chinese.`;

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            return Response.json({
                title: "开启充满活力的一天",
                short_term_narrative: "今天有一些待办事项需要处理，请查看任务列表。",
                long_term_narrative: "别忘了回顾你的笔记，保持长远的目标感。",
                mindful_tip: "深呼吸，专注于当下。"
            });
        }

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
                    { role: "user", content: "Generate my daily briefing." }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`Kimi API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const result = JSON.parse(cleaned);

        return Response.json(result);
    } catch (error) {
        console.error("Daily briefing error:", error?.message || error);
        return Response.json({
            title: "开启充满活力的一天",
            short_term_narrative: "今天有一些待办事项需要处理，请查看任务列表。",
            long_term_narrative: "别忘了回顾你的笔记，保持长远的目标感。",
            mindful_tip: "深呼吸，专注于当下。"
        });
    }
});