import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Robust daily plan generator with provider fallback (OpenAI -> Moonshot)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { input, planDate, existingPlan } = await req.json();
    if (!input || !planDate) {
      return Response.json({ error: 'Missing required fields: input, planDate' }, { status: 400 });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const moonshotKey = Deno.env.get('MOONSHOT_API_KEY');

    if (!openaiKey && !moonshotKey) {
      return Response.json({ error: 'No AI provider keys configured' }, { status: 500 });
    }

    const systemPrompt = existingPlan
      ? `你是一个智能日程助手。用户已有当日规划，现在想追加新内容。请将新内容智能融入现有规划中，避免时间冲突，保持合理节奏。\n现有规划: ${JSON.stringify(existingPlan)}\n当前日期: ${planDate}\n请严格返回JSON对象，字段包括: theme, summary, focus_blocks, key_tasks, evening_review, stats。`
      : `你是一个智能日程助手。请根据用户输入，为 ${planDate} 生成一份详细的日规划。\n严格输出JSON对象，包含: \n- theme: 今日主题 (string)\n- summary: 今日摘要 (string)\n- focus_blocks: 数组 [{time: "HH:mm", duration_minutes: number, title: string, type: "focus"|"meeting"|"personal"|"rest", description: string}]\n- key_tasks: 数组 [{title: string, priority: "high"|"medium"|"low", estimated_minutes: number, time_slot: "morning"|"afternoon"|"evening"}]\n- evening_review: string\n- stats: {focus_hours: number, tasks_count: number, energy_level: "high"|"medium"|"low"}`;

    async function callOpenAI() {
      const apiUrl = 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
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
      const apiUrl = 'https://api.moonshot.cn/v1/chat/completions';
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${moonshotKey}`,
        },
        body: JSON.stringify({
          model: 'moonshot-v1-8k',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input },
          ],
          // Moonshot 不支持 json_schema，这里用提示词约束
          temperature: 0.7,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Moonshot error ${res.status}: ${text}`);
      const json = JSON.parse(text);
      return json.choices?.[0]?.message?.content || '';
    }

    async function generate() {
      const providers = [];
      // 优先 OpenAI，其次 Moonshot
      if (openaiKey) providers.push(callOpenAI);
      if (moonshotKey) providers.push(callMoonshot);

      let content = '';
      let lastErr = null;
      for (const fn of providers) {
        try {
          content = await fn();
          if (content) break;
        } catch (e) {
          console.error('[AI Provider Error]', e?.message || e);
          lastErr = e;
        }
      }

      if (!content) throw lastErr || new Error('AI returned empty response');

      // 解析 JSON：先直接 parse，失败则提取花括号片段
      let planData;
      try {
        planData = JSON.parse(content);
      } catch (_) {
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          const slice = content.slice(start, end + 1);
          planData = JSON.parse(slice);
        } else {
          throw new Error('Failed to parse AI JSON content');
        }
      }

      // 兜底字段
      planData.focus_blocks = Array.isArray(planData.focus_blocks) ? planData.focus_blocks : [];
      planData.key_tasks = Array.isArray(planData.key_tasks) ? planData.key_tasks : [];
      planData.stats = planData.stats || {};
      if (typeof planData.stats.tasks_count !== 'number') {
        planData.stats.tasks_count = planData.key_tasks.length;
      }

      return { ...planData, plan_date: planDate };
    }

    const data = await generate();
    return Response.json(data);
  } catch (error) {
    console.error('[generateDailyPlan] Failed:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
});