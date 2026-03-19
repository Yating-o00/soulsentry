import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Daily plan generator — uses Base44 Core LLM first (no external keys),
// then falls back to OpenAI/Moonshot if available.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { input, planDate, existingPlan } = await req.json();
    if (!input || !planDate) {
      return Response.json({ error: 'Missing required fields: input, planDate' }, { status: 400 });
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

    const baseSystem = existingPlan
      ? `你是一个智能日程助手。用户已有当日规划，现在想追加新内容。请将新内容智能融入现有规划中，避免时间冲突，保持合理节奏。\n现有规划: ${JSON.stringify(existingPlan)}\n当前日期: ${planDate}`
      : `你是一个智能日程助手。请根据用户输入，为 ${planDate} 生成一份详细的日规划。`;

    // 1) Try Core.InvokeLLM (managed provider, no secrets needed)
    try {
      const data = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `${baseSystem}\n用户输入: ${input}\n严格按照给定 JSON Schema 输出 JSON 对象，不要包含多余文本。`,
        response_json_schema: jsonSchema,
        add_context_from_internet: false
      });

      // Core returns parsed object when response_json_schema is provided
      const filled = data || {};
      if (!filled.theme) throw new Error('Empty plan from Core');
      // Fill defaults
      filled.focus_blocks = Array.isArray(filled.focus_blocks) ? filled.focus_blocks : [];
      filled.key_tasks = Array.isArray(filled.key_tasks) ? filled.key_tasks : [];
      filled.stats = filled.stats || { focus_hours: 0, tasks_count: filled.key_tasks.length, energy_level: 'medium' };
      return Response.json({ ...filled, plan_date: planDate });
    } catch (e) {
      console.error('[Core.InvokeLLM failed]', e?.message || e);
      // continue to provider fallback
    }

    // 2) Fallback to external providers if configured
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const moonshotKey = Deno.env.get('MOONSHOT_API_KEY');

    async function callOpenAI() {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `${baseSystem}\n严格输出 JSON 对象，字段与 schema 一致。` },
            { role: 'user', content: input },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${text}`);
      const json = JSON.parse(text);
      return json.choices?.[0]?.message?.content || '';
    }

    async function callMoonshot() {
      const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${moonshotKey}`,
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [
            { role: 'system', content: `${baseSystem}\n严格输出 JSON 对象，字段与 schema 一致。` },
            { role: 'user', content: input },
          ],
          temperature: 0.7,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Moonshot error ${res.status}: ${text}`);
      const json = JSON.parse(text);
      return json.choices?.[0]?.message?.content || '';
    }

    const providers = [];
    if (openaiKey) providers.push(callOpenAI);
    if (moonshotKey) providers.push(callMoonshot);

    if (providers.length === 0) {
      return Response.json({ error: 'AI providers unavailable' }, { status: 500 });
    }

    let content = '';
    let lastErr = null;
    for (const fn of providers) {
      try {
        content = await fn();
        if (content) break;
      } catch (err) {
        console.error('[AI Provider Error]', err?.message || err);
        lastErr = err;
      }
    }
    if (!content) throw lastErr || new Error('AI returned empty response');

    // Parse JSON content
    let planData;
    try {
      planData = JSON.parse(content);
    } catch (_) {
      const s = content.indexOf('{');
      const eIdx = content.lastIndexOf('}');
      if (s !== -1 && eIdx !== -1 && eIdx > s) {
        planData = JSON.parse(content.slice(s, eIdx + 1));
      } else {
        throw new Error('Failed to parse AI JSON content');
      }
    }
    planData.focus_blocks = Array.isArray(planData.focus_blocks) ? planData.focus_blocks : [];
    planData.key_tasks = Array.isArray(planData.key_tasks) ? planData.key_tasks : [];
    planData.stats = planData.stats || { focus_hours: 0, tasks_count: planData.key_tasks.length, energy_level: 'medium' };

    return Response.json({ ...planData, plan_date: planDate });
  } catch (error) {
    console.error('[generateDailyPlan] Failed:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
});