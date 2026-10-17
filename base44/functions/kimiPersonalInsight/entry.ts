import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 个人数据库引擎 - Kimi 实时画像分析
 *
 * 输入：
 *   - scope: 'profile' | 'realtime'  画像总结 / 实时建议
 *   - intent: string (realtime 场景必填，描述用户当前要做什么)
 *
 * 输出：
 *   - insights: [{ title, detail, weight }]
 *   - persona: string  一句话画像
 *   - suggestions: [string]  可执行建议
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scope = 'profile', intent = '' } = await req.json().catch(() => ({}));

    // 取最近 120 条画像数据，按权重排
    const all = await base44.entities.UserDataPoint.list('-occurred_at', 120);
    if (!all.length) {
      return Response.json({
        insights: [],
        persona: '数据积累中，使用越多，画像越准。',
        suggestions: [],
        empty: true,
      });
    }

    // 压缩数据，避免 token 过载
    const compact = all.map(d => ({
      t: d.data_type,
      k: d.event_key,
      s: (d.summary || '').slice(0, 80),
      c: d.context || {},
      w: d.weight || 1,
      at: d.occurred_at,
    }));

    const sysPrompt = scope === 'realtime'
      ? `你是用户的私人 AI 顾问。基于其历史画像数据，针对当前意图给出 2-3 条精准、可执行的建议。避免泛泛而谈。`
      : `你是用户的私人 AI 画像分析师。基于历史数据，提炼用户的操作习惯、效率模式、决策偏好。`;

    const userPrompt = scope === 'realtime'
      ? `当前意图：${intent}\n\n历史数据（最近 ${compact.length} 条）：\n${JSON.stringify(compact)}`
      : `历史数据（最近 ${compact.length} 条）：\n${JSON.stringify(compact)}\n\n请输出洞察。`;

    const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) return Response.json({ error: 'KIMI_API_KEY missing' }, { status: 500 });

    const schema = {
      type: 'object',
      properties: {
        persona: { type: 'string' },
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              detail: { type: 'string' },
              weight: { type: 'number' },
            },
          },
        },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['persona', 'insights', 'suggestions'],
    };

    // 模型 fallback 列表：kimi-k2-turbo-preview 已下线
    const candidateModels = ['kimi-k2-0905-preview', 'kimi-latest', 'moonshot-v1-auto'];
    let resp = null;
    let lastErr = '';
    let lastStatus = 0;
    for (const model of candidateModels) {
      resp = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sysPrompt + `\n\n严格按以下 schema 返回 JSON：\n${JSON.stringify(schema)}` },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (resp.ok) break;
      lastErr = await resp.text();
      lastStatus = resp.status;
      if (resp.status !== 404 && resp.status !== 403) break;
    }

    if (!resp || !resp.ok) {
      return Response.json({ error: `Kimi ${lastStatus}: ${lastErr.slice(0, 200)}` }, { status: 502 });
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try { parsed = JSON.parse(content); } catch { parsed = { persona: '', insights: [], suggestions: [] }; }

    return Response.json({
      ...parsed,
      data_count: compact.length,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});