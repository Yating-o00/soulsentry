import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function callKimi(apiKey, systemPrompt, userPrompt, useJsonFormat) {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userPrompt });
  
  const body = { model: "kimi-k2-turbo-preview", messages, temperature: 0.7 };
  if (useJsonFormat) body.response_format = { type: "json_object" };
  
  const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Kimi API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJSON(content) {
  const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s !== -1 && e > s) return JSON.parse(content.slice(s, e + 1));
  throw new Error('Failed to parse JSON');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const input = body?.input || '';
    const contextDate = body?.date || new Date().toISOString().slice(0, 10);
    const existingPlan = body?.existingPlan || null;

    if (!input.trim()) return Response.json({ error: 'Missing input' }, { status: 400 });

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

    const schema = {
      type: 'object',
      properties: {
        steps: { type: 'array', items: { type: 'object', properties: { key: { type: 'string', enum: ['time_extraction','intent','spatial','device','automation'] }, text: { type: 'string' }, icon: { type: 'string' } }, required: ['key','text'] } },
        resolved_date: { type: 'string' },
        timeline: { type: 'array', items: { type: 'object', properties: { time: { type: 'string' }, date: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, type: { type: 'string', enum: ['meeting','focus','personal','rest'] } }, required: ['time','title','date'] } },
        devices: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', enum: ['phone','watch','glasses','car','home','pc'] }, name: { type: 'string' }, strategies: { type: 'array', items: { type: 'object', properties: { time: { type: 'string' }, method: { type: 'string' }, content: { type: 'string' }, priority: { type: 'string', enum: ['low','medium','high'] } }, required: ['time','method','content'] } } }, required: ['id','name','strategies'] } },
        automations: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, desc: { type: 'string' }, status: { type: 'string', enum: ['active','ready','monitoring','pending'] }, device_id: { type: 'string' } }, required: ['title','desc','status'] } },
        parsed: { type: 'object', properties: { times: { type: 'array', items: { type: 'string' } }, intents: { type: 'array', items: { type: 'string' } }, locations: { type: 'array', items: { type: 'string' } }, distance_km: { type: 'number' } } }
      },
      required: ['steps','timeline','devices','automations','resolved_date']
    };

    // 预计算基于 contextDate 的相对日期锚点（供 AI 精确取用）
    const ctxBase = new Date(contextDate + 'T00:00:00+08:00');
    const fmtDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
    const addDays = (n) => { const x = new Date(ctxBase); x.setUTCDate(x.getUTCDate() + n); return fmtDate(x); };
    const nextWeekDay = (targetDow) => {
      const x = new Date(ctxBase);
      const cur = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
      x.setUTCDate(x.getUTCDate() - (cur - 1) + 7 + ((targetDow === 0 ? 7 : targetDow) - 1));
      return fmtDate(x);
    };
    const firstOfNextMonth = (targetDow) => {
      const x = new Date(ctxBase); x.setUTCMonth(x.getUTCMonth() + 1, 1);
      const dow = x.getUTCDay();
      x.setUTCDate(x.getUTCDate() + ((targetDow - dow + 7) % 7));
      return fmtDate(x);
    };
    const nextMonthEnd = (() => {
      const x = new Date(ctxBase); x.setUTCMonth(x.getUTCMonth() + 2, 0); return fmtDate(x);
    })();

    // 当前北京时间时刻（用于"十分钟后"等表达）
    const nowBJ = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const nowIso = new Date().toISOString();

    const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const contextDayOfWeek = dayNames[new Date(contextDate + 'T00:00:00').getDay()];
    const existingContext = existingPlan ? `\n\n【重要】用户已有如下当日规划，请勿修改或删除已有规划内容，只需要在此基础上融合新内容：\n已有时间线：${JSON.stringify(existingPlan.timeline || [])}\n已有设备策略：${JSON.stringify(existingPlan.devices || [])}\n已有自动化：${JSON.stringify(existingPlan.automations || [])}` : '';

    const prompt = `你是 SoulSentry 心栈的日程智能分析器。请严格以JSON返回，符合提供的JSON Schema。

用户输入（中文）：${input}
用户当前正在查看的日期（视图日期）：${contextDate}（${contextDayOfWeek}）
当前北京时间实时时刻：${nowBJ}
当前 ISO 时间：${nowIso}${existingContext}

【预计算的日期锚点 - 必须使用这些值，不要自己推算】
- 今天 = ${contextDate}
- 明天 = ${addDays(1)}
- 后天 = ${addDays(2)}
- 大后天 = ${addDays(3)}
- 一周后 = ${addDays(7)}
- 下周一=${nextWeekDay(1)} 下周二=${nextWeekDay(2)} 下周三=${nextWeekDay(3)} 下周四=${nextWeekDay(4)} 下周五=${nextWeekDay(5)} 下周六=${nextWeekDay(6)} 下周日=${nextWeekDay(0)}
- 下个月第一个周一=${firstOfNextMonth(1)} 周二=${firstOfNextMonth(2)} 周三=${firstOfNextMonth(3)} 周四=${firstOfNextMonth(4)} 周五=${firstOfNextMonth(5)} 周六=${firstOfNextMonth(6)} 周日=${firstOfNextMonth(0)}
- 下月月底 = ${nextMonthEnd}

【时段映射】早上/上午=09:00 中午=12:00 下午=15:00 傍晚=18:00 晚上=20:00 深夜=22:00

【第一步：时间实体提取与日期归属】
核心原则：用户在日视图输入框中的内容，默认对应当前查看日期（${contextDate}）。
仅当用户输入包含以下【明确日期指示词】时，才归属到其他日期：
- "明天/明早/明晚/明日" → ${addDays(1)}
- "后天" → ${addDays(2)}；"大后天" → ${addDays(3)}
- "下周X/下个星期X" → 对照上方锚点表
- "X月X号/X月X日/X号/X日" → 明确日期
- "下个月第一个周X" → 对照上方锚点表
- "下个月/月底" → ${nextMonthEnd}
- "X分钟后/X小时后" → 基于当前北京时间实时时刻（${nowBJ}）精确累加
以下情况仍归属 ${contextDate}：
- 仅含时刻无日期词、"今天/今晚/今早/现在"、无时间表述、"最近/抽空"
resolved_date 规则：有明确日期指示词→使用上方预计算值；否则→${contextDate}

【时刻解析规则】
- timeline 中的 time 字段格式为 HH:mm（24 小时制）
- "下午3点"=15:00，"晚上7点"=19:00，"傍晚6点"=18:00
- "十分钟后"：基于实时时刻精确计算，并用 HH:mm 输出
- "后天下午" 这类只含时段无具体时刻的：使用对应时段映射（下午=15:00）

【第二步：深度时间理解与情境推演】
像贴身管家一样推演完整情境时间链：提取核心事件→推演前置准备和后续跟进。

【第三步：设备策略生成】
设备策略time字段使用场景化相对时间表达（如"事前30分钟"、"出发时刻"），不用纯数字时间。
设备能力：phone(通知/播报)、watch(触觉反馈)、glasses(AR显示)、car(导航)、home(广播/灯光)、pc(桌面通知)。

【第四步：内容忠实性】
所有输出必须围绕用户实际输入，不要生成无关泛化建议。

输出要求：
1. steps：中文逐步解释分析过程
2. resolved_date：实际日期（YYYY-MM-DD）
3. timeline：完整情境时间线，按时间升序，time格式HH:mm，每条含date字段${existingPlan ? '，保留已有条目追加新条目' : ''}
4. devices：设备策略${existingPlan ? '，保留已有追加新策略' : ''}
5. automations：${existingPlan ? '保留已有追加1-2条新条目' : '2-4条自动化委托'}
6. parsed：提取摘要`;

    const systemMsg = `你必须严格按JSON格式返回结果，符合以下Schema，不要输出任何其他内容。\nJSON Schema:\n${JSON.stringify(schema)}`;
    const content = await callKimi(apiKey.trim(), systemMsg, prompt, true);
    const ai = parseJSON(content);

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