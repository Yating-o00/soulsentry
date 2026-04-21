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
    hour: "2-digit", minute: "2-digit", weekday: "long", hour12: false,
  });
  const todayDate = contextDate || now.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  return { shanghaiStr, todayDate, isoNow: now.toISOString() };
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

    const systemPrompt = `你是一个专业的中文自然语言时间解析引擎。

【时间上下文】
- 当前时间（北京时间）: ${ctx.shanghaiStr}
- 今日日期: ${ctx.todayDate}
- 用户时区: ${TIMEZONE} (UTC+8)

【任务】
从用户输入中提取时间信息，返回规范化的 JSON。

【处理规则 - 严格遵守】
1. 所有时间必须输出为 ISO 8601 带时区格式："YYYY-MM-DDTHH:mm:ss+08:00"
2. 仅有日期无时间（如"明天"、"下周三"）→ 使用纯日期 "YYYY-MM-DD" 格式，并设置 is_all_day=true
3. 有具体时间点（如"明天3点"）→ 输出完整 ISO 带时区，is_all_day=false
4. 时间段（"3点到5点"）→ 同时输出 reminder_time 和 end_time
5. 未给出结束时间的非全天事件 → end_time 设为 null（由调用方默认 +1 小时）
6. 相对时间必须基于上述"当前时间"精确计算
7. 重复规则（"每周三"、"每天"）→ is_recurring=true，在 recurrence_pattern 写明
8. 模糊时间（"过几天"、"有空"、"最近"）→ confidence="low"，时间字段输出最合理的推断值
9. 完全无时间信息 → reminder_time=null, confidence="low"

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