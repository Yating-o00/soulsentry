import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { title, description, subtasks, notes, targetLang } = await req.json();

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

        const prompt = targetLang === 'English' ? 
            `You are a professional translator. Translate the following task information to English.
            
IMPORTANT: Translate ALL content. JSON Keys MUST stay the same, only translate values. Return ONLY valid JSON.

Input Data:
Main Task Title: ${title}
Main Task Description: ${description || "None"}
Subtasks: ${JSON.stringify(subtasks)}
Notes: ${JSON.stringify(notes)}

Response Format:
{
  "title": "Translated Title",
  "description": "Translated Description",
  "subtasks": [{"id": "...", "title": "...", "description": "..."}],
  "notes": [{"index": 0, "content": "..."}]
}` : 
            `你是一位专业翻译助手。请将以下任务信息翻译为简体中文。
            
重要：必须将所有内容翻译成中文。保持JSON键名不变，只翻译值。仅返回有效JSON。

输入数据：
主任务标题: ${title}
主任务描述: ${description || "无"}
子任务列表: ${JSON.stringify(subtasks)}
笔记列表: ${JSON.stringify(notes)}

返回格式:
{
  "title": "翻译后的标题",
  "description": "翻译后的描述",
  "subtasks": [{"id": "...", "title": "...", "description": "..."}],
  "notes": [{"index": 0, "content": "..."}]
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
                    { role: "system", content: "你是一个专业翻译助手，请严格按JSON格式返回翻译结果。" },
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
        const result = JSON.parse(cleaned);

        return Response.json(result);
    } catch (error) {
        console.error("Translation error:", error?.message || error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});