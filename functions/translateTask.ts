import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { title, description, subtasks, notes, targetLang } = await req.json();

        const prompt = targetLang === 'English' ? 
            `You are a professional translator. Translate the following task information to English.
            
IMPORTANT REQUIREMENTS:
1. Translate ALL content to English, even if it looks like English (correct grammar/spelling if needed).
2. JSON Keys MUST stay the same, only translate values.
3. Return ONLY valid JSON.

Input Data:
Main Task Title: ${title}
Main Task Description: ${description || "None"}

Subtasks:
${JSON.stringify(subtasks)}

Notes:
${JSON.stringify(notes)}

Response Format (JSON):
{
  "title": "Translated Title",
  "description": "Translated Description",
  "subtasks": [{"id": "...", "title": "...", "description": "..."}],
  "notes": [{"index": 0, "content": "..."}]
}` : 
            `你是一位专业翻译助手。请将以下任务信息翻译为简体中文。
            
重要要求：
1. 必须将所有内容（标题、描述、子任务、笔记）翻译成中文。
2. 如果原文已经是中文，请优化润色。
3. 保持 JSON 键名不变，只翻译值。
4. 仅返回有效的 JSON 格式。

输入数据：
主任务标题: ${title}
主任务描述: ${description || "无"}

子任务列表:
${JSON.stringify(subtasks)}

笔记列表:
${JSON.stringify(notes)}

返回格式 (JSON):
{
  "title": "翻译后的标题",
  "description": "翻译后的描述",
  "subtasks": [{"id": "...", "title": "...", "description": "..."}],
  "notes": [{"index": 0, "content": "..."}]
}`;

        const schema = {
            type: "object",
            properties: {
                title: { type: "string" },
                description: { type: "string" },
                subtasks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" } } } },
                notes: { type: "array", items: { type: "object", properties: { index: { type: "number" }, content: { type: "string" } } } }
            },
            required: ["title"]
        };

        // 1) Try InvokeLLM first
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: schema
            });
            return Response.json(result);
        } catch (e) {
            console.log('[translateTask] InvokeLLM failed, trying fallback:', e?.message);
        }

        // 2) Fallback: Try OpenAI
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (openaiKey) {
            try {
                const { default: OpenAI } = await import('npm:openai');
                const openai = new OpenAI({ apiKey: openaiKey });
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "You are a helpful assistant that outputs JSON." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                });
                const result = JSON.parse(completion.choices[0].message.content);
                return Response.json(result);
            } catch (oaiErr) {
                console.log('[translateTask] OpenAI failed:', oaiErr?.message);
            }
        }

        // 3) Fallback: Kimi (Moonshot)
        const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
        if (moonshotKey) {
            const kimiRes = await fetch("https://api.moonshot.cn/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${moonshotKey.trim()}`
                },
                body: JSON.stringify({
                    model: "moonshot-v1-8k",
                    messages: [
                        { role: "system", content: "You are a helpful assistant that outputs JSON. Return ONLY valid JSON." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.7
                })
            });
            if (kimiRes.ok) {
                const kimiData = await kimiRes.json();
                const content = kimiData.choices?.[0]?.message?.content || '';
                const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const result = JSON.parse(cleaned);
                return Response.json(result);
            }
        }

        return Response.json({ error: 'All AI providers failed' }, { status: 503 });

    } catch (error) {
        console.error("Translation error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});