import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const input = body?.input || '';
    const contextDate = body?.date || new Date().toISOString().slice(0, 10);
    const existingPlan = body?.existingPlan || null;

    if (!input.trim()) {
      return Response.json({ error: 'Missing input' }, { status: 400 });
    }

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });
    }

    const schema = {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: ['time_extraction','intent','spatial','device','automation'] },
              text: { type: 'string' },
              icon: { type: 'string' }
            },
            required: ['key','text']
          }
        },
        resolved_date: { type: 'string' },
        timeline: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              time: { type: 'string' },
              date: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['meeting','focus','personal','rest'] }
            },
            required: ['time','title','date']
          }
        },
        devices: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', enum: ['phone','watch','glasses','car','home','pc'] },
              name: { type: 'string' },
              strategies: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    time: { type: 'string' },
                    method: { type: 'string' },
                    content: { type: 'string' },
                    priority: { type: 'string', enum: ['low','medium','high'] }
                  },
                  required: ['time','method','content']
                }
              }
            },
            required: ['id','name','strategies']
          }
        },
        automations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              desc: { type: 'string' },
              status: { type: 'string', enum: ['active','ready','monitoring','pending'] },
              device_id: { type: 'string' }
            },
            required: ['title','desc','status']
          }
        },
        parsed: {
          type: 'object',
          properties: {
            times: { type: 'array', items: { type: 'string' } },
            intents: { type: 'array', items: { type: 'string' } },
            locations: { type: 'array', items: { type: 'string' } },
            distance_km: { type: 'number' }
          }
        }
      },
      required: ['steps','timeline','devices','automations','resolved_date']
    };

    const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const contextDayOfWeek = dayNames[new Date(contextDate + 'T00:00:00').getDay()];

    const existingContext = existingPlan ? `\n\n【重要】用户已有如下当日规划，请勿修改或删除已有规划内容，只需要在此基础上融合新内容：\n已有时间线：${JSON.stringify(existingPlan.timeline || [])}\n已有设备策略：${JSON.stringify(existingPlan.devices || [])}\n已有自动化：${JSON.stringify(existingPlan.automations || [])}` : '';

    const prompt = `你是 SoulSentry 心栈的日程智能分析器。请严格以JSON返回，符合提供的JSON Schema。

用户输入（中文）：${input}
用户当前正在查看的日期（视图日期）：${contextDate}（${contextDayOfWeek}）${existingContext}

【第一步：时间实体提取与日期归属】
核心原则：用户在日视图输入框中的内容，默认对应当前查看日期（${contextDate}）。
仅当用户输入包含明确日期指示词时，才归属到其他日期。
resolved_date 规则：有明确日期指示词→计算对应日期；否则→${contextDate}

【第二步：深度时间理解与情境推演】
基于用户的输入推演出完整的情境时间链，包含前置准备和后续跟进。

【第三步：设备策略生成】
设备策略的time字段必须使用场景化的相对时间表达（如"事前30分钟"、"出发时刻"），而非纯粹的绝对时间。
每个设备的策略必须体现该设备的独特能力。

【第四步：内容忠实性规则】
所有输出必须严格围绕用户实际输入。

输出要求：
1. steps：用中文逐步解释分析过程
2. resolved_date：按规则确定的实际日期（YYYY-MM-DD）
3. timeline：基于用户核心事件推演完整情境时间线，按时间升序
4. devices：针对用户事件分配到合适的设备
5. automations：生成2-4条自动化委托
6. parsed：提取到的时间/意图/地点等摘要`;

    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: "kimi-k2-turbo-preview",
        messages: [
          { role: "system", content: `你必须严格按JSON格式返回结果，符合以下Schema。\n${JSON.stringify(schema)}` },
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
    const ai = JSON.parse(cleaned);

    const knownIds = new Set(['phone','watch','glasses','car','home','pc']);
    const devices = (ai.devices || []).filter(d => knownIds.has(d.id));

    return Response.json({
      steps: ai.steps || [],
      resolved_date: ai.resolved_date || contextDate,
      timeline: ai.timeline || [],
      devices,
      automations: ai.automations || [],
      parsed: ai.parsed || {},
    });
  } catch (err) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});