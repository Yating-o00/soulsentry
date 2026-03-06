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

    const prompt = `你是 SoulSentry 心栈的日程智能分析器。请严格以JSON返回，符合提供的JSON Schema。

用户输入（中文）：${input}
用户当前正在查看的日期（视图日期）：${contextDate}（${contextDayOfWeek}）${existingContext}

【第一步：时间实体提取与日期归属】
核心原则：用户在日视图输入框中的内容，默认对应当前查看日期（${contextDate}）。

仅当用户输入包含以下【明确日期指示词】时，才归属到其他日期：
- "明天/明早/明晚/明日" → ${contextDate} 的下一天
- "后天/大后天" → 对应推算
- "下周X/下个星期X" → 下一周对应星期
- "X月X号/X月X日/X号/X日" → 明确日期
- "下个月/月底" → 对应推算

以下情况仍归属 ${contextDate}：
- 仅含时刻（"下午3点"、"晚上8点"、"14:00"）无日期词
- "今天/今晚/今早/现在"
- 无任何时间表述
- "最近/抽空/有时间的时候"

resolved_date 规则：有明确日期指示词→计算对应日期；否则→${contextDate}

【第二步：深度时间理解与情境推演】
你必须像一个贴身管家一样，基于用户的输入推演出完整的情境时间链。

时间理解要求：
1. 提取用户输入中的核心事件及其时间点
2. 根据事件性质，推演出合理的前置准备和后续跟进节点
3. 推演的每个节点都必须与用户核心事件直接相关

示例 - 用户说"明天下午三点和林总在望京SOHO见面，帮我提前准备好项目资料，如果下雨记得叫辆车"：
→ 核心事件：15:00 与林总在望京SOHO会面
→ 推演链：
  - 前一晚21:00：智能音箱播报明日重点（与林总会面）
  - 当天07:00：晨间提醒有重要会议
  - 14:00：出发提醒（基于距离和交通）
  - 14:25：车载导航前往望京SOHO
  - 14:45：到达前查看林总资料
  - 15:00：会面开始，AR辅助
  - 16:00：会后自动生成纪要

【第三步：设备策略生成 - 场景化时间表达】
★★★ 设备策略的time字段必须使用【场景化的相对时间表达】，而非纯粹的绝对时间。

正确的time格式（参照以下示范）：
- "事前30分钟" / "会议前15分钟" / "出发前1小时"
- "出发时刻" / "到达前" / "见面瞬间"
- "上车时" / "驾驶中" / "到达停车场"
- "早晨" / "睡前" / "出门前"
- "工作时段" / "会议中" / "会后"

❌ 错误："14:30"、"09:00"（纯数字时间没有场景感）
✅ 正确："事前30分钟"、"出发时刻"、"到达前"

每个设备的策略必须体现该设备的独特能力：
- phone（智能手机）：锁屏通知、语音播报、浮窗提醒、日历同步
- watch（智能手表）：触觉反馈（节律性轻敲）、表盘显示、简化待办
- glasses（智能眼镜）：AR显示人物资料、实时语音转写、要点标记
- car（电动汽车）：车载语音导航、HUD显示、路线规划、停车预约
- home（智能家居）：渐进式灯光唤醒、全屋广播、语音播报日程
- pc（工作站）：桌面通知、自动打开文档、会议准备清单

【第四步：内容忠实性规则】
所有输出必须严格围绕用户实际输入：
- 推演的前置/后续节点必须与核心事件有因果关系
- 设备策略的content必须描述与用户事件直接相关的操作
- 用户提到地点时→车载设备要有导航策略
- 用户提到人物时→眼镜设备可以有AR资料显示
- 用户提到条件（如"如果下雨"）→生成对应的监控自动化
- 不要生成与用户输入完全无关的泛化建议

输出要求：
1. steps：用中文逐步解释分析过程（时间提取→意图识别→空间计算→设备协同→自动化生成），每步一句话，要引用用户输入中的具体内容。
2. resolved_date：按规则确定的实际日期（YYYY-MM-DD）。
3. timeline：基于用户核心事件推演完整情境时间线（包含合理的前置准备和后续跟进），按时间升序，time格式24小时HH:mm，每条必须包含date字段。${existingPlan ? '保留所有已有时间线条目，仅追加新条目并合并排序。' : ''}
4. devices：针对用户事件分配到合适的设备。strategies.time使用场景化相对表达，strategies.method是该设备的具体执行方式，strategies.content是与用户事件相关的具体操作描述。${existingPlan ? '保留已有设备策略，追加新策略条目。' : '若某设备不适用可省略。'}
5. automations：${existingPlan ? '保留已有自动化条目，追加1-2条新条目。' : '生成2-4条自动化委托，'}每条必须对应用户输入中的具体需求或合理推演。status从 active/ready/monitoring/pending 中选择。
6. parsed：提取到的时间/意图/地点/人物等摘要。`;

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