import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 统一的自然语言时间解析服务
 *
 * 接收自然语言输入，返回规范化的时间信息（带 Asia/Shanghai 时区的 ISO 字符串）。
 *
 * 用于替代系统中所有散落的时间解析逻辑，确保时间处理的一致性。
 *
 * Request body:
 *   { input: string, contextDate?: string (YYYY-MM-DD) }
 *
 * Response:
 *   {
 *     reminder_time: ISO string | null,
 *     end_time: ISO string | null,
 *     is_all_day: boolean,
 *     confidence: "high"|"medium"|"low",
 *     original_expression: string,
 *     is_recurring: boolean,
 *     recurrence_pattern?: string,
 *     title_hint?: string
 *   }
 */

const TIMEZONE = "Asia/Shanghai";

function getTimeContext(contextDate) {
  const now = new Date();
  const shanghaiStr = now.toLocaleString("zh-CN", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long", hour12: false,
  });
  const todayDate = contextDate || now.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  const base = new Date(`${todayDate}T00:00:00+08:00`);
  const fmt = (d) => d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const addDays = (n) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + n); return fmt(x); };
  const nextWeekDay = (dow) => {
    const x = new Date(base);
    const cur = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
    x.setUTCDate(x.getUTCDate() - (cur - 1) + 7 + ((dow === 0 ? 7 : dow) - 1));
    return fmt(x);
  };
  const firstOfNextMonth = (dow) => {
    const x = new Date(base); x.setUTCMonth(x.getUTCMonth() + 1, 1);
    x.setUTCDate(x.getUTCDate() + ((dow - x.getUTCDay() + 7) % 7));
    return fmt(x);
  };
  const anchors = {
    today: todayDate,
    tomorrow: addDays(1),
    dayAfter: addDays(2),
    threeDays: addDays(3),
    oneWeek: addDays(7),
    nextMon: nextWeekDay(1), nextTue: nextWeekDay(2), nextWed: nextWeekDay(3),
    nextThu: nextWeekDay(4), nextFri: nextWeekDay(5), nextSat: nextWeekDay(6), nextSun: nextWeekDay(0),
    firstMonNextMonth: firstOfNextMonth(1), firstTueNextMonth: firstOfNextMonth(2),
    firstWedNextMonth: firstOfNextMonth(3), firstThuNextMonth: firstOfNextMonth(4),
    firstFriNextMonth: firstOfNextMonth(5), firstSatNextMonth: firstOfNextMonth(6), firstSunNextMonth: firstOfNextMonth(0),
  };
  return { shanghaiStr, todayDate, isoNow: now.toISOString(), anchors };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { input, contextDate } = await req.json();
    if (!input || typeof input !== 'string') {
      return Response.json({ error: 'input is required' }, { status: 400 });
    }

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });
    }

    const ctx = getTimeContext(contextDate);

    const a = ctx.anchors;
    const systemPrompt = `你是一个专业的中文自然语言时间解析引擎。

【时间上下文】
- 当前时间（北京时间）: ${ctx.shanghaiStr}
- 今日日期: ${ctx.todayDate}
- 用户时区: ${TIMEZONE} (UTC+8)

【预计算的日期锚点 - 必须直接使用，不要自己推算】
- 今天=${a.today} 明天=${a.tomorrow} 后天=${a.dayAfter} 大后天=${a.threeDays} 一周后=${a.oneWeek}
- 下周一=${a.nextMon} 下周二=${a.nextTue} 下周三=${a.nextWed} 下周四=${a.nextThu} 下周五=${a.nextFri} 下周六=${a.nextSat} 下周日=${a.nextSun}
- 下个月第一个周一=${a.firstMonNextMonth} 周二=${a.firstTueNextMonth} 周三=${a.firstWedNextMonth} 周四=${a.firstThuNextMonth} 周五=${a.firstFriNextMonth} 周六=${a.firstSatNextMonth} 周日=${a.firstSunNextMonth}

【时段映射】早上/上午=09:00 中午=12:00 下午=15:00 傍晚=18:00 晚上=20:00 深夜=22:00

【任务】
从用户输入中提取时间信息，返回规范化的 JSON。

【处理规则 - 严格遵守】
1. 所有时间必须输出为 ISO 8601 带时区格式："YYYY-MM-DDTHH:mm:ss+08:00"
2. 仅有日期无时间（如"明天"、"下周三"）→ 使用纯日期 "YYYY-MM-DD" 格式，并设置 is_all_day=true
3. 有具体时间点（如"明天3点"）→ 输出完整 ISO 带时区，is_all_day=false
4. 时间段（"3点到5点"）→ 同时输出 reminder_time 和 end_time
5. 未给出结束时间的非全天事件 → end_time 设为 null（由调用方默认 +1 小时）
6. 相对时间必须基于上述"当前时间"和【预计算日期锚点】精确计算，不要自己推算
7. "X分钟后/X小时后" → 基于"当前时间（${ctx.shanghaiStr}）"精确累加
8. "后天下午" → 使用"后天=${a.dayAfter}"+"下午=15:00"
9. "下个月第一个周一" → 直接使用 ${a.firstMonNextMonth}
10. 重复规则（"每周三"、"每天"）→ is_recurring=true，在 recurrence_pattern 写明
11. 模糊时间（"过几天"、"有空"、"最近"）→ confidence="low"，时间字段输出最合理的推断值
12. 完全无时间信息 → reminder_time=null, confidence="low"

【confidence 级别】
- high: 用户明确给出日期+时间（"明天下午3点"、"2025-05-01 14:00"）
- medium: 明确日期但时间模糊（"明天"、"下周一"）
- low: 时间表达模糊（"最近"、"有空时"、"过几天"）

【示例】
输入："明天下午3点和老王开会"
输出: {
  "reminder_time": "${ctx.todayDate.slice(0,8)}XXT15:00:00+08:00",
  "end_time": null,
  "is_all_day": false,
  "confidence": "high",
  "original_expression": "明天下午3点",
  "is_recurring": false,
  "title_hint": "和老王开会"
}

输入："每周三晨会"
输出: {
  "reminder_time": "<下一个周三>T09:00:00+08:00",
  "end_time": null,
  "is_all_day": false,
  "confidence": "high",
  "original_expression": "每周三",
  "is_recurring": true,
  "recurrence_pattern": "weekly:wednesday",
  "title_hint": "晨会"
}

仅返回 JSON，不要任何解释。`;

    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: "kimi-k2-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[parseNaturalTime] Kimi error:", response.status, errText);
      return Response.json({
        reminder_time: null,
        end_time: null,
        is_all_day: false,
        confidence: "low",
        original_expression: input,
        is_recurring: false,
        error: `AI service error: ${response.status}`
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_) {
      const s = content.indexOf('{');
      const e = content.lastIndexOf('}');
      parsed = s !== -1 && e > s ? JSON.parse(content.slice(s, e + 1)) : {};
    }

    return Response.json({
      reminder_time: parsed.reminder_time || null,
      end_time: parsed.end_time || null,
      is_all_day: !!parsed.is_all_day,
      confidence: parsed.confidence || "low",
      original_expression: parsed.original_expression || "",
      is_recurring: !!parsed.is_recurring,
      recurrence_pattern: parsed.recurrence_pattern || null,
      title_hint: parsed.title_hint || null,
    });
  } catch (error) {
    console.error('[parseNaturalTime] Failed:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});