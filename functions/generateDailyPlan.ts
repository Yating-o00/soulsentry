import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { input, planDate, existingPlan } = await req.json();

    // Compose prompt (merge mode when existing plan present)
    const header = existingPlan
      ? `你是一个智能日程助手。用户已有当天规划，现在追加新内容。请将下述新输入智能融入现有规划，尽量避免时间冲突并保持节奏合理；必要时可调整时间，但需确保输出为完整、可执行的一天计划。\n现有规划: ${JSON.stringify(existingPlan)}\n当前日期: ${planDate}`
      : `你是一个智能日程助手。请根据用户输入为 ${planDate} 生成一份详细的日规划。`;

    const prompt = `${header}\n\n用户输入:\n${input}`;

    // Strict JSON schema to ensure reliable output
    const responseSchema = {
      type: 'object',
      properties: {
        theme: { type: 'string' },
        summary: { type: 'string' },
        focus_blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              time: { type: 'string', description: 'HH:mm' },
              duration_minutes: { type: 'number' },
              title: { type: 'string' },
              type: { type: 'string', enum: ['focus', 'meeting', 'personal', 'rest'] },
              description: { type: 'string' }
            },
            required: ['time', 'title']
          }
        },
        key_tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              estimated_minutes: { type: 'number' },
              time_slot: { type: 'string', enum: ['morning', 'afternoon', 'evening'] }
            },
            required: ['title']
          }
        },
        evening_review: { type: 'string' },
        stats: {
          type: 'object',
          properties: {
            focus_hours: { type: 'number' },
            tasks_count: { type: 'number' },
            energy_level: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      },
      required: ['theme', 'summary', 'focus_blocks', 'key_tasks', 'stats']
    };

    // Use Base44 Core integration (handles provider + JSON reliability)
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: responseSchema,
      add_context_from_internet: false
    });

    // result already conforms to schema
    return Response.json({ ...result, plan_date: planDate });
  } catch (error) {
    // Return detailed error to frontend for easier debugging
    return Response.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
});