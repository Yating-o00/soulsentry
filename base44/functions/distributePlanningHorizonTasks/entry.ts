import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 周期长度（毫秒）
const HORIZON_MS = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 90 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

// 不同周期建议生成的里程碑数量
const HORIZON_MILESTONES = {
  weekly: 3,    // 一周3个分布提醒
  monthly: 4,   // 一月4个（每周一次）
  quarterly: 6, // 季度6个（约每两周）
  yearly: 12,   // 年度12个（每月）
};

function safeDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function generateMilestonesWithAI(base44, task, count, startTime, endTime) {
  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `用户有一个长期约定，需要拆解为 ${count} 个分布式里程碑，避免每日打扰，按合理节奏推进。

约定标题：${task.title}
约定描述：${task.description || '（无）'}
开始时间：${startTime.toISOString()}
截止时间：${endTime.toISOString()}
周期类型：${task.planning_horizon}

请生成 ${count} 个里程碑，每个里程碑包含：
- title: 简洁的里程碑标题（不超过20字，承接父任务但更聚焦）
- summary: 一句话摘要（不超过30字，说明这次提醒要做什么）
- offset_ratio: 0-1之间的小数，表示从开始到截止的时间位置（均匀分布，最后一个不超过0.95）

同时生成 horizon_summary: 整个长期约定的1句话精炼摘要（不超过25字）。`,
      response_json_schema: {
        type: 'object',
        properties: {
          horizon_summary: { type: 'string' },
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                summary: { type: 'string' },
                offset_ratio: { type: 'number' },
              },
              required: ['title', 'summary', 'offset_ratio'],
            },
          },
        },
        required: ['milestones'],
      },
    });
    return res;
  } catch (e) {
    console.error('AI generation failed, fallback to uniform split', e);
    return null;
  }
}

function buildFallbackMilestones(task, count) {
  const milestones = [];
  for (let i = 0; i < count; i++) {
    milestones.push({
      title: `${task.title} · 进度 ${i + 1}/${count}`,
      summary: `推进「${task.title}」第 ${i + 1} 阶段`,
      offset_ratio: (i + 1) / (count + 1),
    });
  }
  return { milestones, horizon_summary: task.title };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data: task, event } = body;

    if (!task) {
      return Response.json({ skipped: true, reason: 'no task data' });
    }

    const horizon = task.planning_horizon;
    if (!horizon || horizon === 'none') {
      return Response.json({ skipped: true, reason: 'not a long-horizon task' });
    }

    // 仅父任务才分发；子任务（带 parent_task_id）不递归
    if (task.parent_task_id) {
      return Response.json({ skipped: true, reason: 'is a subtask' });
    }

    // 已分发过且非显式重置 → 跳过；通过 horizon_distributed_at 防重
    if (task.horizon_distributed_at && event?.type !== 'create') {
      // 仅当 planning_horizon 在 update 中发生变化时才重新分发
      const oldHorizon = body.old_data?.planning_horizon;
      if (oldHorizon === horizon) {
        return Response.json({ skipped: true, reason: 'already distributed' });
      }
    }

    const now = new Date();
    const startTime = safeDate(task.reminder_time) || now;
    let endTime = safeDate(task.end_time);
    if (!endTime) {
      endTime = new Date(startTime.getTime() + HORIZON_MS[horizon]);
    }
    if (endTime.getTime() <= startTime.getTime()) {
      endTime = new Date(startTime.getTime() + HORIZON_MS[horizon]);
    }

    const count = HORIZON_MILESTONES[horizon] || 3;

    // 调用 AI 生成里程碑
    let plan = await generateMilestonesWithAI(base44, task, count, startTime, endTime);
    if (!plan || !plan.milestones || plan.milestones.length === 0) {
      plan = buildFallbackMilestones(task, count);
    }

    // 查询现有子任务，避免重复创建
    const existingSubs = await base44.asServiceRole.entities.Task.filter({
      parent_task_id: task.id,
    });
    const existingTitles = new Set((existingSubs || []).map(s => (s.title || '').trim()));

    // 创建子任务（里程碑）
    const totalSpan = endTime.getTime() - startTime.getTime();
    const newSubtasks = [];
    for (const ms of plan.milestones) {
      const ratio = Math.max(0, Math.min(0.99, Number(ms.offset_ratio) || 0));
      const milestoneTime = new Date(startTime.getTime() + totalSpan * ratio);
      const title = (ms.title || '').trim() || `${task.title} · 阶段`;
      if (existingTitles.has(title)) continue;

      newSubtasks.push({
        title,
        description: ms.summary || '',
        reminder_time: milestoneTime.toISOString(),
        end_time: milestoneTime.toISOString(),
        priority: task.priority || 'medium',
        category: task.category || 'personal',
        status: 'pending',
        parent_task_id: task.id,
        tags: ['horizon_milestone', `horizon:${horizon}`],
      });
    }

    let createdCount = 0;
    if (newSubtasks.length > 0) {
      await base44.asServiceRole.entities.Task.bulkCreate(newSubtasks);
      createdCount = newSubtasks.length;
    }

    // 更新父任务：记录分发时间和摘要
    await base44.asServiceRole.entities.Task.update(task.id, {
      horizon_distributed_at: new Date().toISOString(),
      horizon_summary: plan.horizon_summary || task.title,
    });

    return Response.json({
      success: true,
      horizon,
      created: createdCount,
      total_planned: plan.milestones.length,
      summary: plan.horizon_summary,
    });
  } catch (error) {
    console.error('distributePlanningHorizonTasks error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});