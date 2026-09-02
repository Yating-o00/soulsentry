import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// 模板自生长：把用户历史约定熔炼成「个人模板」（如「你的差旅约定通常包含这 6 步」）。
// 由前端按天节流调用，跑在用户身份下，模板归属正确。

const SCHEMA = {
  type: 'object',
  properties: {
    templates: {
      type: 'array',
      description: '归纳出的重复套路，0-4 条。证据不足就返回空数组，绝不硬凑。',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '模板名称，4-8 字，如「差旅出行」「季度复盘」' },
          category: { type: 'string', enum: ['work', 'personal', 'health', 'study', 'family', 'shopping', 'finance', 'other'] },
          trigger_keywords: { type: 'array', items: { type: 'string' }, description: '2-5 个命中关键词' },
          evidence: { type: 'string', description: '归纳依据，如「基于你过去 4 次出差安排」' },
          sample_count: { type: 'number', description: '参考的历史约定条数' },
          steps: {
            type: 'array',
            description: '这类事你通常会包含的步骤，3-8 条',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                detail: { type: 'string' },
                offset_hint: { type: 'string', description: '相对主约定的时间提示，如「提前 1 天」' },
              },
              required: ['title'],
            },
          },
        },
        required: ['name', 'trigger_keywords', 'steps'],
      },
    },
  },
  required: ['templates'],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [tasks, existing] = await Promise.all([
      base44.entities.Task.list('-created_date', 200),
      base44.entities.PersonalTemplate.list('-updated_date', 40),
    ]);

    const usable = tasks.filter((t) => !t.deleted_at);
    if (usable.length < 8) {
      return Response.json({ templates: [], skipped: true, reason: '历史约定还太少，继续使用会自动长出模板' });
    }

    const brief = usable.slice(0, 120).map((t) => {
      const parts = [t.title];
      if (t.category) parts.push(`[${t.category}]`);
      if (t.parent_task_id) parts.push('(子约定)');
      return `- ${parts.join(' ')}`;
    }).join('\n');

    const aiRes = await base44.functions.invoke('invokeKimi', {
      prompt: `以下是用户过去的约定清单（含子约定）：\n${brief}\n\n请从中归纳出真实重复出现的「个人套路」，做成可一键复用的模板。\n\n铁律：\n- 只归纳至少出现过 2 次的模式，evidence 必须写清依据。\n- steps 要写用户自己惯用的步骤，不要写通用建议。\n- 找不到明显重复模式就返回空数组。\n- 已存在的模板名（可更新其内容）：${(existing || []).map((e) => e.name).join('、') || '无'}`,
      response_json_schema: SCHEMA,
      system_prompt: '你是心栈 SoulSentry 的模式归纳师。你从用户真实历史中提取重复套路，判断保守，绝不虚构。',
      temperature: 1,
    });

    const data = aiRes?.data || {};
    if (data._parse_error) return Response.json({ error: 'AI 归纳解析失败' }, { status: 500 });

    const incoming = Array.isArray(data.templates) ? data.templates.slice(0, 4) : [];
    const saved = [];
    for (const tpl of incoming) {
      if (!tpl?.name || !Array.isArray(tpl.steps) || tpl.steps.length === 0) continue;
      const payload = {
        name: tpl.name,
        category: tpl.category || 'other',
        trigger_keywords: (tpl.trigger_keywords || []).slice(0, 6),
        evidence: tpl.evidence || '',
        sample_count: tpl.sample_count || 0,
        steps: tpl.steps.slice(0, 8),
        generated_at: new Date().toISOString(),
        is_active: true,
      };
      const hit = (existing || []).find((e) => e.name === tpl.name);
      try {
        const rec = hit
          ? await base44.entities.PersonalTemplate.update(hit.id, payload)
          : await base44.entities.PersonalTemplate.create(payload);
        saved.push(rec);
      } catch (e) {
        console.warn('[forgePersonalTemplates] save failed:', e?.message || e);
      }
    }

    return Response.json({ templates: saved, count: saved.length, analyzed: usable.length });
  } catch (error) {
    const apiErr = error?.response?.data?.error || error?.response?.data?.message;
    return Response.json({ error: apiErr || error.message }, { status: 500 });
  }
});