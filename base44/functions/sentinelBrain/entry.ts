import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * SoulSentry 核心大脑 (sentinelBrain)
 * —— 通过 Kimi API 对任务进行"合适的地点 / 合适的时间 / 合适的方式"三维整合分析。
 *
 * 输入 payload:
 *   - task_id (string, 必填)                  要分析的任务ID
 *   - trigger (string, 可选)                   触发来源: "create" | "update" | "scheduled" | "geofence"
 *   - current_location (object, 可选)          { latitude, longitude, name }
 *
 * 输出:
 *   {
 *     success: true,
 *     analysis: { ...Kimi 返回的结构化结果... },
 *     task: { ...更新后的任务... }
 *   }
 */

const KIMI_API_URL = "https://api.moonshot.ai/v1/chat/completions";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    optimal_reminder_time: { type: "string", description: "最佳提醒时间的ISO8601字符串（带时区）。如果用户已给出精确时间则保持不变；如果模糊则结合上下文推导。" },
    time_is_fuzzy: { type: "boolean", description: "用户输入的时间是否为模糊表达" },
    time_reasoning: { type: "string", description: "为什么选这个时间（1-2句话）" },
    ai_context_summary: { type: "string", description: "3句话内的背景重建：这件事为什么对用户现在很重要" },
    interruption_score: { type: "number", description: "0-100 的干扰分数" },
    interruption_level: { type: "string", enum: ["silent", "ambient", "standard", "assertive", "critical"] },
    delivery_channel: { type: "string", enum: ["in_app", "browser", "email", "silent"] },
    best_location: { type: "string", description: "最适合执行或提醒的地点（如 家 / 公司 / 路上 / 任意），若无位置依赖则填 '任意'" },
    is_waiting_for_reply: { type: "boolean", description: "是否是等待他人回复/反馈的沉默任务" },
    waiting_for: { type: "string", description: "若 is_waiting_for_reply 为 true，写出正在等待谁；否则空字符串" },
    silence_followup_at: { type: "string", description: "若为沉默任务，建议几时进行追问（ISO时间），否则空字符串" },
    forgetting_risk: { type: "string", enum: ["low", "medium", "high"] },
    suggested_priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    priority_reasoning: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } }
  },
  required: [
    "optimal_reminder_time", "time_is_fuzzy", "ai_context_summary",
    "interruption_score", "interruption_level", "delivery_channel",
    "best_location", "is_waiting_for_reply", "forgetting_risk", "suggested_priority"
  ]
};

async function callKimi(prompt, apiKey) {
  const systemContent = `你是 SoulSentry（灵魂哨兵）—— 一个深度理解用户情境的智能提醒大脑。
你的使命：让每一次提醒都发生在「合适的地点 · 合适的时间 · 合适的方式」。

分析原则：
1. 时间：若用户给出精确时间（如"下午3点"），以用户为准；若模糊（如"有空时"、"这周"），结合用户历史活跃时段推导。
2. 地点：识别任务是否有位置依赖（买菜=商场/超市，开会=公司，锻炼=健身房）。
3. 打断梯度：
   - critical (90-100): 错过会造成严重后果（医疗/重要会议/截止前1小时）
   - assertive (70-89): 重要且时效强（客户回复/家人约定）
   - standard (40-69): 常规任务提醒
   - ambient (20-39): 低优先级，合并到日报/红点
   - silent (0-19): 仅入库，不打扰
4. 沉默任务：识别"等某人回复""等审批"等被动等待型任务，设定合理追问时间。
5. 遗忘风险：基于任务年龄、重要性、用户交互频次评估。

请严格按以下 JSON Schema 返回，不输出任何多余文字：
${JSON.stringify(RESPONSE_SCHEMA)}`;

  const response = await fetch(KIMI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: "kimi-k2-turbo-preview",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Kimi API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) return JSON.parse(match[1]);
    throw new Error("Kimi 返回内容非合法 JSON");
  }
}

function buildPrompt({ task, userBehaviorSummary, currentLocation, now, trigger }) {
  const lines = [
    `【当前时刻】${now}（时区 Asia/Shanghai）`,
    `【触发来源】${trigger || "manual"}`,
    ``,
    `【任务信息】`,
    `- 标题：${task.title || ""}`,
    `- 描述：${task.description || "（无）"}`,
    `- 类别：${task.category || "personal"}`,
    `- 当前优先级：${task.priority || "medium"}`,
    `- 用户设定的提醒时间：${task.reminder_time || "（未设定）"}`,
    `- 截止/结束时间：${task.end_time || "（未设定）"}`,
    `- 已推迟次数：${task.snooze_count || 0}`,
    `- 任务创建于：${task.created_date || "（未知）"}`,
    `- 当前状态：${task.status || "pending"}`,
  ];

  if (task.location_reminder?.enabled) {
    lines.push(`- 绑定地点：${task.location_reminder.location_name || "已设置坐标"}`);
  }

  if (currentLocation) {
    lines.push(``, `【用户当前位置】${currentLocation.name || `${currentLocation.latitude},${currentLocation.longitude}`}`);
  }

  lines.push(``, `【用户行为画像】`, userBehaviorSummary || "暂无足够历史数据，请使用通用最佳实践。");

  lines.push(``, `请基于以上信息，输出 SoulSentry 的完整情境分析 JSON。`);
  return lines.join("\n");
}

async function summarizeUserBehavior(base44, userEmail) {
  try {
    const records = await base44.asServiceRole.entities.UserBehavior.filter(
      { created_by: userEmail }, "-created_date", 60
    );
    if (!records || records.length === 0) return null;

    const hourCounts = {};
    const categoryHours = {};
    let completions = 0;
    let snoozes = 0;
    let totalResponse = 0;
    let responseCount = 0;

    for (const r of records) {
      if (typeof r.hour_of_day === "number") {
        hourCounts[r.hour_of_day] = (hourCounts[r.hour_of_day] || 0) + 1;
        if (r.category) {
          categoryHours[r.category] = categoryHours[r.category] || {};
          categoryHours[r.category][r.hour_of_day] = (categoryHours[r.category][r.hour_of_day] || 0) + 1;
        }
      }
      if (r.event_type === "task_completed") completions++;
      if (r.event_type === "task_snoozed") snoozes++;
      if (typeof r.response_time_seconds === "number") {
        totalResponse += r.response_time_seconds;
        responseCount++;
      }
    }

    const topHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([h]) => `${h}:00`).join("、");

    const avgResponse = responseCount > 0 ? Math.round(totalResponse / responseCount) : null;

    return [
      `- 活跃时段 TOP3：${topHours || "未知"}`,
      `- 近期完成任务：${completions} 个；推迟：${snoozes} 次`,
      avgResponse !== null ? `- 平均响应时长：${avgResponse} 秒` : `- 平均响应时长：无数据`,
    ].join("\n");
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) return Response.json({ error: "KIMI_API_KEY not configured" }, { status: 500 });

    const { task_id, trigger, current_location } = await req.json();
    if (!task_id) return Response.json({ error: "Missing task_id" }, { status: 400 });

    const task = await base44.entities.Task.get(task_id);
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

    const userBehaviorSummary = await summarizeUserBehavior(base44, user.email);

    const prompt = buildPrompt({
      task,
      userBehaviorSummary,
      currentLocation: current_location,
      now: new Date().toISOString(),
      trigger
    });

    const analysis = await callKimi(prompt, apiKey);

    // 合并写回 Task
    const updatePayload = {
      sentinel_analyzed_at: new Date().toISOString(),
      ai_context_summary: analysis.ai_context_summary || "",
      interruption_score: typeof analysis.interruption_score === "number" ? analysis.interruption_score : 50,
      interruption_level: analysis.interruption_level || "standard",
      is_waiting_for_reply: !!analysis.is_waiting_for_reply,
      waiting_for: analysis.waiting_for || "",
      forgetting_risk: analysis.forgetting_risk || "low",
      last_forgetting_check: new Date().toISOString(),
      ai_analysis: {
        ...(task.ai_analysis || {}),
        suggested_priority: analysis.suggested_priority,
        priority_reasoning: analysis.priority_reasoning || "",
        risks: analysis.risks || [],
        suggestions: analysis.suggestions || [],
        time_reasoning: analysis.time_reasoning || "",
        time_is_fuzzy: !!analysis.time_is_fuzzy,
        best_location: analysis.best_location || "任意",
        delivery_channel: analysis.delivery_channel || "in_app",
      }
    };

    // 用户已设定精确时间 → 保留；否则采用 AI 建议
    if (analysis.optimal_reminder_time) {
      updatePayload.optimal_reminder_time = analysis.optimal_reminder_time;
    }
    if (analysis.silence_followup_at) {
      updatePayload.silence_followup_at = analysis.silence_followup_at;
    }

    const updated = await base44.entities.Task.update(task_id, updatePayload);

    return Response.json({ success: true, analysis, task: updated });
  } catch (error) {
    console.error("sentinelBrain error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});