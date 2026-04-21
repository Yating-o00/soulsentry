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

    const timeRules = `
【时间输出规则 - 严格遵守】
- 用户时区: Asia/Shanghai (UTC+8)
- 规划日期: ${planDate}
- 所有时间字段必须用 ISO 8601 带时区格式，例如："${planDate}T15:00:00+08:00"
- key_tasks 和 focus_blocks 中，若有具体时间，reminder_time/start_time/end_time 都使用完整 ISO 格式
- 若某任务为全天（无具体时间），reminder_time 使用 "${planDate}" 纯日期，并设置 is_all_day: true
- 未指定结束时间的任务，可省略 end_time（后端会默认补 +1 小时）
- 所有时间必须位于 ${planDate} 当天
`.trim();

    const baseSystem = existingPlan
      ? `你是一个智能日程助手。用户已有当日规划，现在想追加新内容。请将新内容智能融入现有规划中，避免时间冲突，保持合理节奏。\n现有规划: ${JSON.stringify(existingPlan)}\n\n${timeRules}\n\n严格按照给定 JSON Schema 输出 JSON 对象，不要包含多余文本。`
      : `你是一个智能日程助手。请根据用户输入，为 ${planDate} 生成一份详细的日规划。\n\n${timeRules}\n\n严格按照给定 JSON Schema 输出 JSON 对象，不要包含多余文本。`;

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