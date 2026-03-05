import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const input = body?.input || '';
    const contextDate = body?.date || new Date().toISOString().slice(0, 10);

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
        timeline: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              time: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['meeting','focus','personal','rest'] }
            },
            required: ['time','title']
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
      required: ['steps','timeline','devices','automations']
    };

    const prompt = `你是一个日程智能分析器。请严格以JSON返回，符合提供的JSON Schema。\n\n用户输入（中文）：${input}\n参考日期（YYYY-MM-DD）：${contextDate}\n\n输出要求：\n1. steps：用中文逐步解释分析过程（时间提取→意图识别→空间计算→设备协同→自动化生成），每步一句，简短。\n2. timeline：生成当天与此输入相关的关键情境时间线（按时间升序），time格式24小时HH:mm。\n3. devices：针对 phone, watch, glasses, car, home, pc 给出与本次输入强相关的一对一策略，策略描述简短，强调执行动作。若某设备不适用，可省略该设备。\n4. automations：生成3-5条自动化委托，status从 active/ready/monitoring/pending 中选择。\n5. parsed：给出提取到的时间/意图/地点等摘要。`;

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
      timeline: ai.timeline || [],
      devices,
      automations: ai.automations || [],
      parsed: ai.parsed || {},
    });
  } catch (err) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});