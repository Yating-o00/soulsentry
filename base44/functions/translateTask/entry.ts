import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
        if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { title, description, subtasks, notes, targetLang } = await req.json();

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

        const prompt = targetLang === 'English' ? 
            `You are a professional translator. Translate the following task information to English.
IMPORTANT: Translate ALL content to English. JSON Keys MUST stay the same. Return ONLY valid JSON.
Input Data:
Main Task Title: ${title}
Main Task Description: ${description || "None"}
Subtasks: ${JSON.stringify(subtasks)}
Notes: ${JSON.stringify(notes)}
Response Format:
{"title":"Translated Title","description":"Translated Description","subtasks":[{"id":"...","title":"...","description":"..."}],"notes":[{"index":0,"content":"..."}]}` : 
            `你是一位专业翻译助手。请将以下任务信息翻译为简体中文。
要求：翻译所有内容，如果原文是中文则优化润色。保持JSON键名不变。仅返回JSON。
输入数据：
主任务标题: ${title}
主任务描述: ${description || "无"}
子任务列表: ${JSON.stringify(subtasks)}
笔记列表: ${JSON.stringify(notes)}
返回格式:
{"title":"翻译后标题","description":"翻译后描述","subtasks":[{"id":"...","title":"...","description":"..."}],"notes":[{"index":0,"content":"..."}]}`;

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

        if (!res.ok) throw new Error(`Kimi API error: ${res.status}`);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const result = parseJSON(content);
        return Response.json(result);

    } catch (error) {
        console.error("Translation error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});