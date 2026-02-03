import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to get the current date/time in Shanghai timezone
const getShanghaiTime = () => {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch Tasks (Pending/In Progress)
        const tasks = await base44.entities.Task.filter({
            status: ['pending', 'in_progress']
        }, '-priority', 20); // Top 20 by priority

        // Fetch Recent Notes
        const notes = await base44.entities.Note.list('-created_date', 5);

        const taskSummary = tasks.map(t => `- [${t.priority}] ${t.title} (Due: ${t.end_time || 'None'})`).join('\n');
        const noteSummary = notes.map(n => `- ${n.content.substring(0, 100)}...`).join('\n');

        const systemPrompt = `
You are "SoulSentry" (心栈), a mindful personal companion.
Your goal is to generate a "Daily Briefing" for the user based on their tasks and notes.

**Input Data:**
- **Current Time:** ${getShanghaiTime()}
- **User Name:** ${user.full_name || 'Traveler'}
- **Tasks:** 
${taskSummary}
- **Recent Thoughts (Notes):**
${noteSummary}

**Instructions:**
1. **Analyze**: Look at the tasks and notes. Distinguish between:
    - **Short-term Focus (当下):** Urgent tasks, immediate deadlines, quick actions needed today.
    - **Long-term/Strategic (远见):** recurring goals, long-term notes, future aspirations, or low priority but meaningful tasks.
2. **Synthesize**: Write a natural, warm, and encouraging briefing. Do not just list items. Weave them into a narrative.
3. **Format**: Return a JSON object strictly:
{
  "greeting": "Warm greeting based on time of day",
  "short_term_narrative": "A paragraph focusing on what needs to be done *today*. Mention specific high priority tasks naturally.",
  "long_term_narrative": "A paragraph connecting recent notes or less urgent tasks to bigger picture goals or state of mind.",
  "mindful_tip": "A one-sentence actionable mindfulness tip related to their workload."
}

**Tone:**
Warm, calm, supportive, efficient but not robotic. (Language: Simplified Chinese)
`;

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        
        let result = null;

        // Try Moonshot (International)
        if (apiKey) {
            try {
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
                        temperature: 0.7
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const content = data.choices[0].message.content;
                    const jsonStr = content.replace(/^```json\n|\n```$/g, '').trim();
                    result = JSON.parse(jsonStr);
                }
            } catch (e) {
                console.error("Moonshot failed:", e);
            }
        }

        // Fallback to OpenAI
        if (!result && openaiKey) {
             const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${openaiKey.trim()}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: "Generate my daily briefing." }
                    ],
                    temperature: 0.7
                })
            });
            if (response.ok) {
                const data = await response.json();
                const content = data.choices[0].message.content;
                const jsonStr = content.replace(/^```json\n|\n```$/g, '').trim();
                result = JSON.parse(jsonStr);
            }
        }

        if (!result) {
            // Fallback if AI fails completely
            result = {
                greeting: "你好",
                short_term_narrative: "今天有一些待办事项需要处理，请查看任务列表。",
                long_term_narrative: "别忘了回顾你的笔记，保持长远的目标感。",
                mindful_tip: "深呼吸，专注于当下。"
            };
        }

        return Response.json(result);

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});