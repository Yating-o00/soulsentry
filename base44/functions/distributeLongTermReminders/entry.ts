import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 周期 → 检查点数量与命名
const HORIZON_CONFIG = {
  weekly:    { checkpoints: 3, label: '本周', spanDays: 7 },
  monthly:   { checkpoints: 4, label: '本月', spanDays: 30 },
  quarterly: { checkpoints: 6, label: '本季度', spanDays: 90 },
  yearly:    { checkpoints: 12, label: '本年', spanDays: 365 },
};

function pickAnchor(task) {
  const now = new Date();
  const start = task.reminder_time ? new Date(task.reminder_time) : now;
  const end = task.end_time ? new Date(task.end_time) : null;
  return { start: start < now ? now : start, end };
}

// 在 [start, end] 之间均匀分布 N 个检查点
function spreadCheckpoints(start, end, count) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs || count <= 0) return [];
  const points = [];
  // 第一个点在 ~1/(count+1) 处，最后一个点在 ~count/(count+1) 处（避免落在端点上）
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    points.push(new Date(startMs + (endMs - startMs) * t));
  }
  return points;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const event = body.event || {};
    const data = body.data || null;
    const oldData = body.old_data || null;
    const taskId = event.entity_id;

    if (!taskId) {
      return Response.json({ skipped: true, reason: 'no entity_id' });
    }

    // 拉最新任务数据（防 payload_too_large）
    const task = data || await base44.asServiceRole.entities.Task.get(taskId);
    if (!task) return Response.json({ skipped: true, reason: 'task not found' });

    const horizon = task.planning_horizon;
    if (!horizon || horizon === 'none') {
      return Response.json({ skipped: true, reason: 'not a long-term task' });
    }

    // 仅当 planning_horizon / title / description 变化或首次创建时才重生成
    const horizonChanged = !oldData || oldData.planning_horizon !== task.planning_horizon;
    const titleChanged = oldData && oldData.title !== task.title;
    const descChanged = oldData && oldData.description !== task.description;
    const alreadyHasPlan = task.long_term_plan && Array.isArray(task.long_term_plan.checkpoints) && task.long_term_plan.checkpoints.length > 0;

    if (alreadyHasPlan && !horizonChanged && !titleChanged && !descChanged) {
      return Response.json({ skipped: true, reason: 'plan already exists and key fields unchanged' });
    }

    const cfg = HORIZON_CONFIG[horizon];
    if (!cfg) return Response.json({ skipped: true, reason: `unknown horizon ${horizon}` });

    // 计算时间窗口
    const { start, end } = pickAnchor(task);
    const effectiveEnd = end || new Date(start.getTime() + cfg.spanDays * 86400000);
    const checkpointDates = spreadCheckpoints(start, effectiveEnd, cfg.checkpoints);

    if (checkpointDates.length === 0) {
      return Response.json({ skipped: true, reason: 'no valid time window' });
    }

    // 调用 LLM 生成简洁摘要 + 每个检查点的标题/摘要
    const prompt = `你是一个长期约定规划助手。用户有一个跨度为「${cfg.label}」的长期约定，请把它拆解成 ${cfg.checkpoints} 个分布式检查点（不是每天提醒，而是阶段性提醒）。

任务标题：${task.title}
任务描述：${task.description || '（无）'}
开始时间：${start.toISOString()}
结束时间：${effectiveEnd.toISOString()}

要求：
1. 生成一个"长期摘要"：不超过 20 字，一句话概括这个约定的核心目标。
2. 为每个检查点生成一个"简洁标题"（不超过 12 字）和"简洁摘要"（不超过 25 字），描述这个阶段应该做什么。
3. 不要重复原标题，要体现阶段性进度（如"启动"、"中期推进"、"收尾验收"等）。
4. 严格输出 ${cfg.checkpoints} 个检查点，顺序与时间顺序一致。`;

    let aiResult = null;
    try {
      aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            long_term_summary: { type: 'string' },
            checkpoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  summary: { type: 'string' }
                },
                required: ['title', 'summary']
              }
            }
          },
          required: ['long_term_summary', 'checkpoints']
        }
      });
    } catch (e) {
      console.error('InvokeLLM failed', e);
    }

    // 兜底
    const aiCheckpoints = (aiResult && Array.isArray(aiResult.checkpoints)) ? aiResult.checkpoints : [];
    const longTermSummary = (aiResult && aiResult.long_term_summary) || task.title;

    // 构建 checkpoints + 创建对应子任务
    const checkpoints = [];
    for (let i = 0; i < checkpointDates.length; i++) {
      const date = checkpointDates[i];
      const ai = aiCheckpoints[i] || {};
      const cpTitle = ai.title || `${cfg.label}阶段 ${i + 1}`;
      const cpSummary = ai.summary || '阶段性推进';

      // 创建子任务（分布式提醒落地为真实子任务）
      let subtaskId = null;
      try {
        const subtask = await base44.asServiceRole.entities.Task.create({
          title: `${task.title} · ${cpTitle}`,
          description: cpSummary,
          reminder_time: date.toISOString(),
          priority: task.priority || 'medium',
          category: task.category || 'personal',
          status: 'pending',
          parent_task_id: taskId,
          tags: [...(task.tags || []), 'long_term_checkpoint', horizon]
        });
        subtaskId = subtask?.id || null;
      } catch (e) {
        console.error('Failed to create checkpoint subtask', e);
      }

      checkpoints.push({
        scheduled_at: date.toISOString(),
        title: cpTitle,
        summary: cpSummary,
        subtask_id: subtaskId,
        status: 'pending'
      });
    }

    // 如果有旧 plan，先把旧的 checkpoint 子任务清掉（避免重复堆积）
    if (alreadyHasPlan && horizonChanged) {
      const oldIds = (task.long_term_plan.checkpoints || [])
        .map((c) => c.subtask_id)
        .filter(Boolean);
      for (const id of oldIds) {
        try {
          await base44.asServiceRole.entities.Task.delete(id);
        } catch (e) {
          // ignore
        }
      }
    }

    // 写回父任务
    await base44.asServiceRole.entities.Task.update(taskId, {
      long_term_summary: longTermSummary,
      long_term_plan: {
        generated_at: new Date().toISOString(),
        horizon,
        checkpoints
      }
    });

    return Response.json({
      success: true,
      horizon,
      checkpoint_count: checkpoints.length,
      summary: longTermSummary
    });
  } catch (error) {
    console.error('distributeLongTermReminders error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});