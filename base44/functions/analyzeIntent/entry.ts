import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function callKimi(apiKey, systemPrompt, userPrompt, useJsonFormat) {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userPrompt });
  
  // 降低温度以提高时间解析的确定性（时间是结构化信息，不应发挥创造性）
  const body = { model: "kimi-k2-turbo-preview", messages, temperature: 0.2 };
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
    // 本周各日（以周一为起点，包含今日）
    const thisWeekDay = (targetDow) => {
      const x = new Date(ctxBase);
      const cur = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
      x.setUTCDate(x.getUTCDate() - (cur - 1) + ((targetDow === 0 ? 7 : targetDow) - 1));
      return fmtDate(x);
    };
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
    const thisMonthEnd = (() => {
      const x = new Date(ctxBase); x.setUTCMonth(x.getUTCMonth() + 1, 0); return fmtDate(x);
    })();
    const nextMonthStart = (() => {
      const x = new Date(ctxBase); x.setUTCMonth(x.getUTCMonth() + 1, 1); return fmtDate(x);
    })();
    const nextMonthEnd = (() => {
      const x = new Date(ctxBase); x.setUTCMonth(x.getUTCMonth() + 2, 0); return fmtDate(x);
    })();
    // 本月上/中/下旬中间日（1-10/11-20/21-月底）
    const thisMonthEarly = fmtDate(new Date(new Date(ctxBase).setUTCDate(5)));
    const thisMonthMid = fmtDate(new Date(new Date(ctxBase).setUTCDate(15)));
    const thisMonthLate = fmtDate(new Date(new Date(ctxBase).setUTCDate(25)));

    // 当前北京时间时刻（用于"十分钟后"等表达）
    const nowBJ = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const nowIso = new Date().toISOString();
    // 用于 ISO 拼接的当前北京时间 HH:mm:ss
    const nowHMS = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false });

    const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const contextDayOfWeek = dayNames[new Date(contextDate + 'T00:00:00').getDay()];
    // 本周末（周六）
    const thisWeekend = thisWeekDay(6);
    const existingContext = existingPlan ? `\n\n【重要】用户已有如下当日规划，请勿修改或删除已有规划内容，只需要在此基础上融合新内容：\n已有时间线：${JSON.stringify(existingPlan.timeline || [])}\n已有设备策略：${JSON.stringify(existingPlan.devices || [])}\n已有自动化：${JSON.stringify(existingPlan.automations || [])}` : '';

    const prompt = `你是 SoulSentry 心栈的日程智能分析器。请严格以JSON返回，符合提供的JSON Schema。

用户输入（中文）：${input}
用户当前正在查看的日期（视图日期）：${contextDate}（${contextDayOfWeek}）
当前北京时间实时时刻：${nowBJ}
当前 ISO 时间：${nowIso}${existingContext}

【预计算的日期锚点 - 必须直接采用，禁止自行推算】
▸ 今/明/后天
- 今天 = ${contextDate}（${contextDayOfWeek}）
- 明天/明早/明晚/明日 = ${addDays(1)}
- 后天 = ${addDays(2)}
- 大后天 = ${addDays(3)}
- 三天后 = ${addDays(3)}；五天后 = ${addDays(5)}；一周后/七天后 = ${addDays(7)}；十天后 = ${addDays(10)};两周后 = ${addDays(14)}

▸ 本周（周一为起点）
- 本周一=${thisWeekDay(1)} 本周二=${thisWeekDay(2)} 本周三=${thisWeekDay(3)} 本周四=${thisWeekDay(4)} 本周五=${thisWeekDay(5)} 本周六=${thisWeekDay(6)} 本周日=${thisWeekDay(0)}
- 这周末/本周末 = ${thisWeekend}

▸ 下周
- 下周一=${nextWeekDay(1)} 下周二=${nextWeekDay(2)} 下周三=${nextWeekDay(3)} 下周四=${nextWeekDay(4)} 下周五=${nextWeekDay(5)} 下周六=${nextWeekDay(6)} 下周日=${nextWeekDay(0)}

▸ 本月/下月
- 本月上旬(中间日)=${thisMonthEarly} 本月中旬=${thisMonthMid} 本月下旬=${thisMonthLate}
- 本月月底/月末 = ${thisMonthEnd}
- 下个月/下月初 = ${nextMonthStart}
- 下月月底 = ${nextMonthEnd}
- 下个月第一个周一=${firstOfNextMonth(1)} 周二=${firstOfNextMonth(2)} 周三=${firstOfNextMonth(3)} 周四=${firstOfNextMonth(4)} 周五=${firstOfNextMonth(5)} 周六=${firstOfNextMonth(6)} 周日=${firstOfNextMonth(0)}

▸ 相对时刻基准（北京时间）
- 当前实时时刻 = ${nowBJ}（HH:mm:ss = ${nowHMS}）
- "X分钟后/X小时后" 以此为基准精确累加，结果用 24 小时制 HH:mm

【时段映射（无具体时刻时使用）】
- 清晨/凌晨=06:00 早上/早晨/上午=09:00 上午晚些=11:00
- 中午/午饭=12:00 午后=13:30 下午=15:00 下午晚些=17:00
- 傍晚=18:00 晚上/晚饭后=20:00 深夜/临睡=22:00

【模糊时间处理策略】
- "最近/抽空/有空时/过几天" → 归属 ${contextDate}，timeline 不生成（或在 automations 中用 status="pending"）
- "周末" 不明确指本周下周时 → 取 ${thisWeekend}
- "下周末" → ${nextWeekDay(6)}
- "下下周X" → 下周X 对应日期再 +7
- 跨年表达如"明年1月3日"：年份 = 当前年+1，日期取该年1月3日

【第一步：时间实体提取与日期归属 - 强制流程】
① 先在输入里定位所有时间词片段（日期词+时段词+时刻词），逐一查锚点表取值，严禁自行算日期；
② 核心原则：用户在日视图输入框中的内容，默认对应当前查看日期（${contextDate}）；
③ 包含【任意明确日期/时段指示词】→ 归属该日期；
④ 仅含时刻无日期词、"今天/今晚/今早/现在"、"最近/抽空"、无时间表述 → 归属 ${contextDate}；
⑤ resolved_date：有明确日期指示词→使用上方预计算值；否则→${contextDate}；
⑥ 每个 timeline 条目的 date 字段必须严格取自上方锚点或 ${contextDate}，不可输出其他日期。

【时刻解析规则】
- timeline 中的 time 字段格式为 HH:mm（24 小时制）
- "下午3点"=15:00，"晚上7点"=19:00，"傍晚6点"=18:00
- "X点半"=X:30；"X点一刻"=X:15；"X点三刻"=X:45
- "十分钟后"=基于 ${nowHMS} 精确计算并换算为 HH:mm
- 只含时段无时刻的（如"后天下午"）：使用对应时段映射（下午=15:00）

【少样本示例（当前 contextDate=${contextDate}）】
例1 输入："后天下午3点和客户开会"
→ resolved_date=${addDays(2)}，timeline:[{date:"${addDays(2)}", time:"15:00", title:"和客户开会", type:"meeting"}]

例2 输入："下个月第一个周一提交季度报告"
→ resolved_date=${firstOfNextMonth(1)}，timeline:[{date:"${firstOfNextMonth(1)}", time:"09:00", title:"提交季度报告", type:"focus"}]

例3 输入："十分钟后订外卖"（假设当前时刻 ${nowHMS.slice(0,5)}）
→ resolved_date=${contextDate}，timeline 的 time 为"${nowHMS.slice(0,5)}+10min"的结果（由你精确计算）

例4 输入："这周末去爬山"
→ resolved_date=${thisWeekend}，timeline:[{date:"${thisWeekend}", time:"09:00", title:"去爬山", type:"personal"}]

例5 输入："下周三下午两点半开产品评审"
→ resolved_date=${nextWeekDay(3)}，timeline:[{date:"${nextWeekDay(3)}", time:"14:30", title:"开产品评审", type:"meeting"}]

例6 输入："本月月底前交体检报告"
→ resolved_date=${thisMonthEnd}，timeline:[{date:"${thisMonthEnd}", time:"18:00", title:"交体检报告", type:"focus"}]

【第二步：深度时间理解与情境推演】
像贴身管家一样推演完整情境时间链：提取核心事件→推演前置准备和后续跟进。

【第三步：设备策略生成】
设备策略time字段使用场景化相对时间表达（如"事前30分钟"、"出发时刻"），不用纯数字时间。
设备能力：phone(通知/播报)、watch(触觉反馈)、glasses(AR显示)、car(导航)、home(广播/灯光)、pc(桌面通知)。

【第四步：内容忠实性】
所有输出必须围绕用户实际输入，不要生成无关泛化建议。

输出要求：
1. steps：中文逐步解释分析过程；其中 time_extraction 步骤必须回显"你从输入中识别到的时间词片段 + 所取的锚点日期"，便于调试（例如："后天下午3点 → ${addDays(2)} 15:00"）
2. resolved_date：实际日期（YYYY-MM-DD），严格来自上方锚点表或 ${contextDate}
3. timeline：完整情境时间线，按时间升序，time格式HH:mm，每条含 date 字段（必须来自锚点表或 ${contextDate}）${existingPlan ? '，保留已有条目追加新条目' : ''}
4. devices：设备策略${existingPlan ? '，保留已有追加新策略' : ''}
5. automations：${existingPlan ? '保留已有追加1-2条新条目' : '2-4条自动化委托'}
6. parsed.times：必须列出你识别到的所有时间词原文（供用户核对）`;

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