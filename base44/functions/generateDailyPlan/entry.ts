import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { input, planDate, existingPlan } = await req.json();
    if (!input || !planDate) {
      return Response.json({ error: 'Missing required fields: input, planDate' }, { status: 400 });
    }

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });
    }

    const jsonSchema = {
      type: 'object',
      properties: {
        theme: { type: 'string' },
        summary: { type: 'string' },
        focus_blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              time: { type: 'string' },
              duration_minutes: { type: 'number' },
              title: { type: 'string' },
              type: { type: 'string', enum: ['focus', 'meeting', 'personal', 'rest'] },
              description: { type: 'string' }
            }
          }
        },
        key_tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              estimated_minutes: { type: 'number' },
              time_slot: { type: 'string', enum: ['morning', 'afternoon', 'evening'] }
            }
          }
        },
        evening_review: { type: 'string' },
        stats: {
          type: 'object',
          properties: {
            focus_hours: { type: 'number' },
            tasks_count: { type: 'number' },
            energy_level: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      },
      required: ['theme', 'summary', 'focus_blocks', 'key_tasks', 'evening_review', 'stats']
    };

    const systemPrompt = existingPlan
      ? `你是一个智能日程助手。用户已有当日规划，现在想追加新内容。请将新内容智能融入现有规划中，避免时间冲突，保持合理节奏。\n现有规划: ${JSON.stringify(existingPlan)}\n当前日期: ${planDate}\n\n你必须严格按JSON格式返回结果，符合以下Schema。\n${JSON.stringify(jsonSchema)}`
      : `你是一个智能日程助手。请根据用户输入，为 ${planDate} 生成一份详细的日规划。\n\n你必须严格按JSON格式返回结果，符合以下Schema。\n${JSON.stringify(jsonSchema)}`;

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
          { role: "user", content: input }
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
    const planData = JSON.parse(cleaned);

    planData.focus_blocks = Array.isArray(planData.focus_blocks) ? planData.focus_blocks : [];
    planData.key_tasks = Array.isArray(planData.key_tasks) ? planData.key_tasks : [];
    planData.stats = planData.stats || { focus_hours: 0, tasks_count: planData.key_tasks.length, energy_level: 'medium' };

    return Response.json({ ...planData, plan_date: planDate });
  } catch (error) {
    console.error('[generateDailyPlan] Failed:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
});