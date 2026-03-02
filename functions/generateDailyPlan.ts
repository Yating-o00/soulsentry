import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { input, planDate, existingPlan } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");

    const isMoonshot = !!Deno.env.get("MOONSHOT_API_KEY") && !Deno.env.get("OPENAI_API_KEY");
    const apiUrl = isMoonshot
      ? "https://api.moonshot.cn/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const model = isMoonshot ? "moonshot-v1-8k" : "gpt-4o-mini";

    const systemPrompt = existingPlan
      ? `你是一个智能日程助手。用户已有今日规划，现在想追加新内容。请将新内容智能融入现有规划中，避免时间冲突，保持合理节奏。
现有规划: ${JSON.stringify(existingPlan)}
当前日期: ${planDate}
请返回完整的更新后规划JSON。`
      : `你是一个智能日程助手。请根据用户输入，为 ${planDate} 生成一份详细的日规划。
请返回JSON格式，包含:
- theme: 今日主题 (string)
- summary: 今日摘要 (string)
- focus_blocks: 专注时间块数组 [{time: "HH:mm", duration_minutes: number, title: string, type: "focus"|"meeting"|"personal"|"rest", description: string}]
- key_tasks: 关键任务列表 [{title: string, priority: "high"|"medium"|"low", estimated_minutes: number, time_slot: "morning"|"afternoon"|"evening"}]
- evening_review: 晚间复盘建议 (string)
- stats: {focus_hours: number, tasks_count: number, energy_level: "high"|"medium"|"low"}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return Response.json({ error: 'AI returned empty response' }, { status: 500 });

    const planData = JSON.parse(content);
    return Response.json({ ...planData, plan_date: planDate });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});