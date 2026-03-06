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

    const prompt = `你是一个日程智能分析器。请严格以JSON返回，符合提供的JSON Schema。

用户输入（中文）：${input}
用户当前正在查看的日期（视图日期）：${contextDate}（${contextDayOfWeek}）${existingContext}

【最高优先级规则 - 默认归属当前视图日期】
★★★ 核心原则：用户在日视图的输入框中输入的内容，默认就是对当前查看日期（${contextDate}）的规划。
★★★ 只有当用户输入中包含【明确的时间指示词】时，才将事项安排到其他日期。

明确的时间指示词包括（且仅限于）：
- "明天"、"明早"、"明晚"、"明日" → 当前日期的下一天
- "后天"、"大后天" → 对应推算
- "昨天"、"昨晚"、"前天" → 对应推算
- "下周X"、"下个星期X" → 从当前日期所在周的下一周对应星期计算
- "上周X"、"上个星期X" → 过去对应推算
- "X月X号"、"X月X日"、"X号"、"X日" → 明确的日期
- "下个月"、"月底" → 对应推算

【不算时间指示词的情况 - 仍归属 ${contextDate}】
- 仅包含时刻（如 "下午3点"、"晚上8点"、"14:00"）但没有日期词 → 归属 ${contextDate}
- "今天"、"今晚"、"今早"、"现在" → 归属 ${contextDate}
- 完全没有提到任何时间 → 归属 ${contextDate}
- 模糊表达如"最近"、"抽空"、"有时间的时候" → 归属 ${contextDate}

因此，resolved_date 的判断逻辑是：
1. 用户输入是否包含上述【明确的时间指示词】？
   - 是 → 计算该指示词对应的绝对日期，设为 resolved_date
   - 否 → resolved_date = ${contextDate}

所有timeline条目必须包含date字段（YYYY-MM-DD格式），表示该事项实际发生的日期。

【★★★ 最关键规则 - 内容必须忠实于用户输入 ★★★】
所有输出内容（timeline、devices策略、automations）必须严格围绕用户实际输入的内容生成。
- 禁止编造用户未提及的任务、事件或安排
- 禁止添加用户未要求的额外提醒、检查、进度追踪等内容
- devices中每个策略的content字段必须直接对应用户输入中的某个具体事项
- devices中每个策略的time字段必须与用户输入中提到的时间一致
- automations的title和desc必须直接源自用户输入的内容
- 如果用户只输入了一件事，那么每个设备最多1-2条策略，不要为了"丰富"而添加无关内容

例如：
- 用户输入"下午3点开会" → 设备策略只能围绕"开会"这件事展开（如手机：15:00 日历提醒开会；手表：14:55 振动提醒即将开会）
- 不能生成与"开会"无关的策略（如"检查邮件"、"整理文件"等用户未提到的事项）

输出要求：
1. steps：用中文逐步解释分析过程（时间提取→意图识别→空间计算→设备协同→自动化生成），每步一句，简短。
2. resolved_date：按照上述规则确定的实际日期（YYYY-MM-DD）。
3. timeline：仅生成用户输入中明确提到的事项的时间线（按时间升序），time格式24小时HH:mm，每条必须包含date字段。${existingPlan ? '必须保留所有已有的时间线条目不变，仅添加与新输入相关的新条目，合并后按时间排序。' : ''}
4. devices：针对用户输入的事项，分配到合适的设备。每个设备的strategies.content必须直接描述用户输入中的事项，不得编造。${existingPlan ? '保留已有设备策略，在对应设备下追加新策略条目。' : '若某设备不适用，可省略。只返回与该事项确实相关的设备。'}
5. automations：${existingPlan ? '保留所有已有自动化条目，追加与新输入相关的新自动化条目（1-2条）。' : '仅基于用户输入生成1-3条自动化委托，'}status从 active/ready/monitoring/pending 中选择。每条自动化必须直接对应用户输入中的内容。
6. parsed：给出提取到的时间/意图/地点等摘要（仅针对新输入）。`;

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