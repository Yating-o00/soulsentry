import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function callKimi(apiKey, systemPrompt, userPrompt) {
  const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "kimi-k2-turbo-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    })
  });
  if (!res.ok) throw new Error(`Kimi API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

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

    const { input, planDate, existingPlan } = await req.json();
    if (!input || !planDate) return Response.json({ error: 'Missing required fields: input, planDate' }, { status: 400 });

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

    const baseSystem = existingPlan
      ? `你是一个智能日程助手。用户已有当日规划，现在想追加新内容。请将新内容智能融入现有规划中，避免时间冲突，保持合理节奏。\n现有规划: ${JSON.stringify(existingPlan)}\n当前日期: ${planDate}\n严格按照给定 JSON Schema 输出 JSON 对象，不要包含多余文本。`
      : `你是一个智能日程助手。请根据用户输入，为 ${planDate} 生成一份详细的日规划。严格按照给定 JSON Schema 输出 JSON 对象，不要包含多余文本。`;

    const content = await callKimi(apiKey.trim(), baseSystem, input);
    const planData = parseJSON(content);

    planData.focus_blocks = Array.isArray(planData.focus_blocks) ? planData.focus_blocks : [];
    planData.key_tasks = Array.isArray(planData.key_tasks) ? planData.key_tasks : [];
    planData.stats = planData.stats || { focus_hours: 0, tasks_count: planData.key_tasks.length, energy_level: 'medium' };

    return Response.json({ ...planData, plan_date: planDate });
  } catch (error) {
    console.error('[generateDailyPlan] Failed:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
});