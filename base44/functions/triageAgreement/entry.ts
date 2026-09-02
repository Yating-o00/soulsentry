import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// 约定分诊器：约定创建瞬间判断「机器可兑现部分」与「需人做部分」，
// 按类型分级的信任档位决定是直接执行（已完成请验收）还是只出方案（可一键执行）。

const DEFAULT_TIERS = {
  email_draft: 'auto_draft',
  web_research: 'auto_draft',
  office_doc: 'auto_draft',
  ppt_doc: 'auto_draft',
  summary_note: 'auto_draft',
  ledger_organize: 'auto_draft',
  calendar_event: 'auto_draft',
  file_organize: 'confirm_first',
};

function tierOf(policies, type) {
  const hit = (policies || []).find((p) => p.automation_type === type);
  return hit?.tier || DEFAULT_TIERS[type] || 'confirm_first';
}

function shouldAutoRun(tier, risk) {
  if (tier === 'full_auto') return true;
  if (tier === 'auto_draft') return risk !== 'high';
  return false;
}

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '对这条约定的一句话理解' },
    machine_parts: {
      type: 'array',
      description: '心栈可以直接替用户兑现的部分，0-3 条。没有就返回空数组，绝不硬凑。',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '6-14 字的简短标题' },
          detail: { type: 'string', description: '一句话说明要替用户产出什么，作为执行指令使用，要具体' },
          automation_type: {
            type: 'string',
            enum: ['email_draft', 'file_organize', 'web_research', 'office_doc', 'ppt_doc', 'calendar_event', 'summary_note', 'ledger_organize'],
          },
          risk: { type: 'string', enum: ['low', 'medium', 'high'], description: '不可逆/对外发生动作/改动既有数据=high；生成新文件或草稿=low' },
        },
        required: ['title', 'detail', 'automation_type', 'risk'],
      },
    },
    human_parts: {
      type: 'array',
      description: '只有人能做的部分，0-4 条',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          time_hint: { type: 'string', description: '时间提示，没有就留空' },
        },
        required: ['title'],
      },
    },
  },
  required: ['machine_parts', 'human_parts'],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const taskId = body.task_id || null;
    let text = String(body.input_text || '').trim();
    let taskTitle = body.task_title || '';

    let task = null;
    if (taskId) {
      task = await base44.entities.Task.get(taskId);
      if (task) {
        taskTitle = task.title;
        text = [task.title, task.description].filter(Boolean).join('\n');
      }
    }
    if (!text) return Response.json({ error: 'task_id 或 input_text 至少提供一个' }, { status: 400 });

    const policies = await base44.entities.TrustPolicy.list('-updated_date', 30);

    const aiRes = await base44.functions.invoke('invokeKimi', {
      prompt: `当前时间：${new Date().toISOString()}\n\n用户刚刚记下的一条约定：\n${text}\n\n请判断这条约定里：\n1) 哪些部分心栈可以【直接替用户产出成果】（写邮件草稿、做调研报告、生成文档/演示稿、整理成心签、整理账本、加日历事件、整理文件）；\n2) 哪些部分只有人能做（去现场、当面沟通、身体锻炼、决策拍板等）。\n\n铁律：\n- 宁缺毋滥。如果这条约定纯粹是人要做的事（如「下午三点去接孩子」「明早跑步」），machine_parts 必须返回空数组。\n- detail 会被当作真正的执行指令，必须包含足够上下文，能独立成立。\n- 对外发送邮件、删除或改动既有文件属于 high 风险；生成新文件、写草稿属于 low 风险。`,
      response_json_schema: SCHEMA,
      system_prompt: '你是心栈 SoulSentry 的约定分诊官。你的职责是把一条约定精准切分为「机器可兑现」与「需人做」两部分，判断保守、绝不虚构可执行项。',
      temperature: 1,
    });

    const data = aiRes?.data || {};
    if (data._parse_error) return Response.json({ error: 'AI 分诊解析失败，请重试' }, { status: 500 });

    const machineParts = Array.isArray(data.machine_parts) ? data.machine_parts.slice(0, 3) : [];
    const humanParts = Array.isArray(data.human_parts) ? data.human_parts.slice(0, 4) : [];

    const results = [];
    for (const part of machineParts) {
      const tier = tierOf(policies, part.automation_type);
      const autoRun = shouldAutoRun(tier, part.risk);
      let exec = null;
      let state = 'planned';
      let error = '';

      try {
        exec = await base44.entities.TaskExecution.create({
          task_id: taskId || undefined,
          task_title: part.title || taskTitle || '自动兑现',
          category: 'task',
          execution_status: 'parsing',
          original_input: part.detail,
          automation_type: part.automation_type,
          ai_parsed_result: {
            intent: part.title,
            summary: data.summary || '',
            source: 'triage',
          },
        });

        await base44.functions.invoke('executeAutomation', { execution_id: exec.id, phase: 'plan' });

        if (autoRun) {
          await base44.functions.invoke('executeAutomation', { execution_id: exec.id, phase: 'execute' });
          state = 'delivered';
        } else {
          state = 'awaiting_confirm';
        }
      } catch (e) {
        state = 'failed';
        error = e?.response?.data?.error || e?.message || '执行失败';
      }

      results.push({
        title: part.title,
        detail: part.detail,
        automation_type: part.automation_type,
        risk: part.risk,
        tier,
        execution_id: exec?.id || null,
        state,
        error,
      });
    }

    return Response.json({
      summary: data.summary || '',
      machine_parts: results,
      human_parts: humanParts,
      delivered_count: results.filter((r) => r.state === 'delivered').length,
    });
  } catch (error) {
    const apiErr = error?.response?.data?.error || error?.response?.data?.message;
    return Response.json({ error: apiErr || error.message }, { status: 500 });
  }
});