import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * extractAndPlanTask
 *
 * 使用 Kimi API 解析用户自然语言输入：
 *  ① 抽取结构化任务（Task 实体） — 标题、时间、分类等
 *  ② 根据任务类型规划 AI 执行步骤链路 — 存入 TaskExecution.execution_steps
 *     例如"会议"任务 → 同步日历 / 预定资源 / 发送通知 三个步骤
 *
 * 返回：{ task, execution }
 */

async function callKimi(apiKey, systemPrompt, userPrompt) {
  const body = {
    model: "kimi-k2-turbo-preview",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  };
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
  throw new Error('Failed to parse Kimi JSON');
}

/**
 * 根据任务类别给出默认的规划步骤模板。
 * AI 可在此基础上微调或覆盖。
 */
function defaultStepsByCategory(category) {
  const now = new Date().toISOString();
  const pending = (name, detail) => ({ step_name: name, status: "pending", detail, timestamp: now });

  switch (category) {
    case "work":
      // 会议/工作类 → 同步日历、预定资源、发送通知
      return [
        pending("同步日历", "将任务写入 Google Calendar，供多端查看"),
        pending("预定资源", "预约会议室、设备或协作工具"),
        pending("发送通知", "提前向参与者与本人推送提醒"),
      ];
    case "health":
      return [
        pending("同步日历", "写入日历以便手机/手表跨端提醒"),
        pending("设置多级提醒", "按剂量与时段推送应用内与邮件提醒"),
        pending("记录执行", "完成后写入健康日志"),
      ];
    case "study":
      return [
        pending("同步日历", "把学习时段放入日历"),
        pending("准备资料", "整理链接、笔记与参考资源"),
        pending("专注提醒", "开始前推送免打扰建议"),
      ];
    case "shopping":
      return [
        pending("整理清单", "把要买的物品汇总为清单"),
        pending("推送提醒", "在出门/到店时间推送"),
      ];
    case "finance":
      return [
        pending("记录事项", "在账目/财务笔记中登记"),
        pending("到期提醒", "提前多级提醒避免逾期"),
      ];
    case "family":
      return [
        pending("同步日历", "写入共享日历让家人同步"),
        pending("推送提醒", "提前推送至手机与手表"),
      ];
    case "personal":
    default:
      return [
        pending("同步日历", "写入日历实现跨端可见"),
        pending("推送提醒", "按 reminder_time 推送应用内与邮件通知"),
      ];
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const input = (body?.input || '').trim();
    const contextDate = body?.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
    if (!input) return Response.json({ error: 'Missing input' }, { status: 400 });

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

    // ---------- ① 用 Kimi 解析任务 + 规划执行步骤 ----------
    const nowBJ = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

    // 拉取用户最近的完成习惯（按 category 聚合常见处理时段）
    let userHabits = "暂无历史数据，请基于常识判断";
    try {
      const recentBehaviors = await base44.asServiceRole.entities.UserBehavior.filter(
        { event_type: "task_completed", created_by: user.email },
        "-created_date",
        50
      );
      if (recentBehaviors && recentBehaviors.length > 0) {
        const byCategory = {};
        recentBehaviors.forEach(b => {
          if (!b.category || b.hour_of_day == null) return;
          if (!byCategory[b.category]) byCategory[b.category] = [];
          byCategory[b.category].push(b.hour_of_day);
        });
        const lines = Object.entries(byCategory).map(([cat, hours]) => {
          const avg = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
          return `- ${cat}：通常在 ${String(avg).padStart(2,'0')}:00 左右处理`;
        });
        if (lines.length > 0) userHabits = lines.join('\n');
      }
    } catch (_) { /* ignore */ }

    const systemMsg = `你是 SoulSentry 的任务规划引擎。严格返回 JSON，不要输出任何其它文本。
任务分类枚举: work, personal, health, study, family, shopping, finance, other
优先级枚举: low, medium, high, urgent
执行步骤状态枚举: pending, running, completed, failed`;

    const userPrompt = `请从用户输入中解析出一条任务，并规划 AI 的执行步骤链路。

用户输入："${input}"
上下文日期: ${contextDate}
当前北京时间: ${nowBJ}

【用户历史习惯参考】
${userHabits}

【第一步：解析任务】
- title：简短清晰的任务标题
- description：原样使用用户输入（不得改写）
- reminder_time：任务的**开始/起算时间**，ISO 8601 带 +08:00 时区，如 "${contextDate}T15:00:00+08:00"；如是全天则用 "YYYY-MM-DD"
- end_time：任务的**截止/结束时间**，ISO 8601 带 +08:00 时区；**没有明确结束时间则留空字符串 ""，不要瞎编**
- duration_minutes：执行时长（分钟）。仅用于"明确的单点事件"（如开会、跑步、看医生），如不明确请留 null

【时间设定规则——必须根据用户语义灵活判断，不要套死 09:00-10:00】

A) **窗口型 / 倒计时型**（"X 天内"、"X 小时内"、"48 小时倒计时"、"截止到 X"、"在 X 之前"）
   · reminder_time = **当前时间**（现在就开始倒计时）
   · end_time = **窗口的结束时刻**（now + X 天 / X 小时 / 用户指定的截止时刻）
   · 例："两天内敲定方案"（现在 ${nowBJ}） → reminder_time=现在, end_time=现在+48小时
   · 例："48 小时倒计时" → reminder_time=现在, end_time=现在+48小时
   · 例："周五前提交" → reminder_time=现在, end_time=本周五 23:59
   · duration_minutes = null
   · time_is_suggested = false（用户明确给了截止窗口）

B) **明确时间点型**（"明天3点开会"、"今晚8点跑步"）
   · reminder_time = 用户说的时间
   · end_time = reminder_time + duration_minutes（如有合理时长估计），否则留空 ""
   · 会议默认 60 分钟、跑步 45 分钟、吃饭 60 分钟、看医生 60 分钟、看电影 120 分钟、通话 30 分钟
   · time_is_suggested = false

C) **模糊/无时间型**（"买花"、"取快递"、"读书"）
   · 根据任务语义 + 用户习惯智能建议：
     - 顺路型（买花/带书/取快递/逛超市） → 今天 18:00-19:00
     - 晨间型（晨跑/早餐） → 明天 07:00-08:00
     - 午餐 → 今天/明天 12:00
     - 吃药 → 下一个饭后 30 分钟
     - 学习/阅读 → 今晚 20:00-21:00
     - 睡前/冥想 → 今晚 22:00
     - 其他 → 参考用户习惯，否则今天 18:00
   · end_time：仅当是明确事件时才填，否则留 ""
   · time_is_suggested = true

⚠️ 严禁：不要给所有任务无脑填 09:00-10:00；不要给"截止/窗口/倒计时"型任务设单点时间。

- time_is_suggested：true 表示是 AI 建议的时间，false 表示用户明确指定
- is_all_day：无具体时刻且无法智能建议时为 true
- category：根据语义判断（会议/工作→work；吃药/运动→health；学习→study；家人→family;购物→shopping；还款/账单→finance；其他→personal）
- priority：根据紧迫性判断
- repeat_rule：识别重复表达，取值之一: "none" | "daily" | "weekly" | "monthly" | "custom"
  · "每天/每晚/每日/天天" → daily
  · "每周X/每个星期X" → weekly
  · "每月X日/每个月" → monthly
  · "每两天/每隔X天/工作日/周末" → custom
  · 无重复表达 → none
- custom_recurrence：仅当 repeat_rule="custom" 或 "weekly"+多天 时返回，结构:
  { "frequency": "daily|weekly|monthly", "interval": 数字, "days_of_week": [0-6], "days_of_month": [数字], "end_date": "YYYY-MM-DD（如有截止日则填，否则留空）" }
  · 例："每天晚上8点提醒" → repeat_rule="daily"
  · 例："工作日早9点开会" → repeat_rule="custom", custom_recurrence={frequency:"weekly", interval:1, days_of_week:[1,2,3,4,5]}
  · 例："连续30天每晚8点打卡" → repeat_rule="daily", custom_recurrence={frequency:"daily", interval:1, end_date:"<起始日+30天>"}

【第二步：规划执行链路（execution_steps）】
根据任务类型自动生成一个"AI 需要实施的步骤"列表。这不是用户的子任务，而是 AI 为完成此任务所规划要做的事。

规则：
- 会议/工作类：必须包含 "同步日历"、"预定资源"、"发送通知" 三步
- 吃药/健康类：必须包含 "同步日历"、"设置多级提醒"、"记录执行" 三步
- 学习类：包含 "同步日历"、"准备资料"、"专注提醒"
- 购物类：包含 "整理清单"、"推送提醒"
- 财务类：包含 "记录事项"、"到期提醒"
- 家人/个人类：至少 "同步日历" + "推送提醒"

每个步骤格式：
{ "step_name": "同步日历", "status": "pending", "detail": "简要说明 AI 将如何执行这一步" }

所有步骤初始 status 必须为 "pending"。detail 要具体、贴合用户实际内容（例如"将'与张总的Q4规划会议'写入 Google Calendar 并邀请参会者"）。

严格按以下 JSON 返回：
{
  "task": {
  "title": "string",
  "description": "string",
  "reminder_time": "string",
  "end_time": "string or empty",
  "duration_minutes": null,
  "is_all_day": false,
  "time_is_suggested": false,
  "category": "string",
  "priority": "string",
  "repeat_rule": "none",
  "custom_recurrence": null
  },
  "execution_steps": [
    { "step_name": "string", "status": "pending", "detail": "string" }
  ],
  "ai_parsed_result": {
    "intent": "string",
    "summary": "一句话概括 AI 将如何帮用户完成这件事"
  }
}`;

    const content = await callKimi(apiKey.trim(), systemMsg, userPrompt);
    const ai = parseJSON(content);

    const aiTask = ai.task || {};
    const title = aiTask.title || input.slice(0, 50);
    const category = aiTask.category || "personal";

    // ---------- ② 创建 Task 实体 ----------
    const validRepeatRules = ["none", "daily", "weekly", "monthly", "custom"];
    const repeatRule = validRepeatRules.includes(aiTask.repeat_rule) ? aiTask.repeat_rule : "none";

    // end_time 兜底：如果 AI 没给 end_time，但给了 duration_minutes 且有 reminder_time，就推算
    let endTime = (aiTask.end_time && typeof aiTask.end_time === 'string' && aiTask.end_time.trim()) ? aiTask.end_time.trim() : '';
    if (!endTime && aiTask.duration_minutes && aiTask.reminder_time && !aiTask.is_all_day) {
      const startMs = Date.parse(aiTask.reminder_time);
      const dur = Number(aiTask.duration_minutes);
      if (!isNaN(startMs) && !isNaN(dur) && dur > 0) {
        endTime = new Date(startMs + dur * 60 * 1000).toISOString();
      }
    }

    const taskPayload = {
      title,
      description: aiTask.description || input,
      reminder_time: aiTask.reminder_time,
      is_all_day: !!aiTask.is_all_day,
      time_is_suggested: !!aiTask.time_is_suggested,
      category,
      priority: aiTask.priority || "medium",
      status: "pending",
      gcal_sync_enabled: true,
      repeat_rule: repeatRule,
    };
    if (endTime) taskPayload.end_time = endTime;
    if (repeatRule !== "none" && aiTask.custom_recurrence && typeof aiTask.custom_recurrence === "object") {
      taskPayload.custom_recurrence = aiTask.custom_recurrence;
    }
    const createdTask = await base44.entities.Task.create(taskPayload);

    // ---------- ③ 规划执行步骤（AI 返回为准，缺失则用默认模板兜底） ----------
    const now = new Date().toISOString();
    let steps = Array.isArray(ai.execution_steps) ? ai.execution_steps : [];
    steps = steps
      .filter(s => s && s.step_name)
      .map(s => ({
        step_name: String(s.step_name),
        status: s.status || "pending",
        detail: s.detail || "",
        timestamp: now,
      }));
    if (steps.length === 0) {
      steps = defaultStepsByCategory(category);
    }

    // ---------- ④ 写入 TaskExecution 实体 ----------
    const execution = await base44.entities.TaskExecution.create({
      task_id: createdTask.id,
      task_title: title,
      category: "task",
      execution_status: "pending",
      original_input: input,
      ai_parsed_result: {
        intent: ai.ai_parsed_result?.intent || category,
        summary: ai.ai_parsed_result?.summary || "",
        entities: [],
        time_expression: aiTask.reminder_time || "",
        priority: aiTask.priority || "medium",
      },
      execution_steps: steps,
    });

    return Response.json({ ok: true, task: createdTask, execution });
  } catch (err) {
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});