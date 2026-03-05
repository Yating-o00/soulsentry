import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
        resolved_date: {
          type: 'string',
          description: 'The actual date (YYYY-MM-DD) that the user input refers to, resolved from relative expressions like today/tomorrow/next Monday etc.'
        },
        timeline: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              time: { type: 'string' },
              date: { type: 'string', description: 'The date this timeline item belongs to, in YYYY-MM-DD format' },
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

    // Compute day-of-week name for the context date
    const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const contextDayOfWeek = dayNames[new Date(contextDate + 'T00:00:00').getDay()];

    const existingContext = existingPlan ? `\n\n【重要】用户已有如下当日规划，请勿修改或删除已有规划内容，只需要在此基础上融合新内容：\n已有时间线：${JSON.stringify(existingPlan.timeline || [])}\n已有设备策略：${JSON.stringify(existingPlan.devices || [])}\n已有自动化：${JSON.stringify(existingPlan.automations || [])}` : '';

    const prompt = `你是一个日程智能分析器。请严格以JSON返回，符合提供的JSON Schema。\n\n用户输入（中文）：${input}\n当前日期（今天）：${contextDate}（${contextDayOfWeek}）${existingContext}\n\n【关键规则 - 时间解析】\n用户输入中的相对时间词必须解析为绝对日期：\n- "今天"、"今晚"、"现在" → ${contextDate}\n- "明天"、"明早"、"明晚" → 明天的实际日期\n- "后天" → 后天的实际日期\n- "下周X" → 计算实际日期\n- "X号"、"X日" → 当月或下月的对应日期\n所有timeline条目必须包含date字段（YYYY-MM-DD格式），表示该事项实际发生的日期。\nresolved_date字段应为用户输入中主要事项对应的实际日期。\n\n输出要求：\n1. steps：用中文逐步解释分析过程（时间提取→意图识别→空间计算→设备协同→自动化生成），每步一句，简短。\n2. resolved_date：用户输入所指的实际日期（YYYY-MM-DD），如"明天下午开会"则返回明天的日期。\n3. timeline：生成与输入相关的完整情境时间线（按时间升序），time格式24小时HH:mm，每条必须包含date字段。${existingPlan ? '必须保留所有已有的时间线条目不变，仅添加与新输入相关的新条目，合并后按时间排序。' : ''}\n4. devices：针对 phone, watch, glasses, car, home, pc 给出策略。${existingPlan ? '保留已有设备策略，在对应设备下追加新策略条目。' : '若某设备不适用，可省略。'}\n5. automations：${existingPlan ? '保留所有已有自动化条目，追加与新输入相关的新自动化条目（1-3条）。' : '生成3-5条自动化委托，'}status从 active/ready/monitoring/pending 中选择。\n6. parsed：给出提取到的时间/意图/地点等摘要（仅针对新输入）。`;

    const ai = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false,
      response_json_schema: schema
    });

    // Ensure devices only includes known ids and add defaults when empty
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