import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const REASON_LABELS = {
  device_not_ready: "设备/条件未就绪",
  time_conflict: "时间冲突",
  energy_low: "精力不足",
  external_blocker: "外部阻塞",
  forgot: "遗忘",
  scope_changed: "范围变更",
  other: "其他原因",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // 最近 200 条执行记录（用户范围）
    const executions = await base44.entities.TaskExecution.list('-created_date', 200);

    const byType = {};
    for (const exec of executions) {
      const type = exec.automation_type;
      if (!type || type === 'none') continue;
      if (!byType[type]) byType[type] = { total: 0, completed: 0, failed: 0, ratings: [] };
      const bucket = byType[type];
      bucket.total += 1;
      if (exec.execution_status === 'completed') bucket.completed += 1;
      if (exec.execution_status === 'failed') bucket.failed += 1;
      const rating = exec.user_feedback?.rating;
      if (typeof rating === 'number') bucket.ratings.push(rating);
    }

    // 信任分：成功率 60% + 用户评价 40%（无评价时按中性 3.5 分计）
    const types = {};
    for (const [type, b] of Object.entries(byType)) {
      const decided = b.completed + b.failed;
      const successRate = decided > 0 ? b.completed / decided : 0.5;
      const avgRating = b.ratings.length > 0
        ? b.ratings.reduce((s, r) => s + r, 0) / b.ratings.length
        : 3.5;
      const score = Math.round(successRate * 60 + (avgRating / 5) * 40);
      const level = score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low';
      types[type] = {
        score,
        level,
        total: b.total,
        completed: b.completed,
        failed: b.failed,
        avg_rating: b.ratings.length > 0 ? Math.round(avgRating * 10) / 10 : null,
        rating_count: b.ratings.length,
      };
    }

    // 顺延原因洞察（最近 100 条）
    const deferrals = await base44.entities.TaskDeferralLog.list('-created_date', 100);
    const reasonCounts = {};
    for (const d of deferrals) {
      const key = d.reason_category || 'other';
      reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    }
    const deferral_insights = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => ({
        reason,
        label: REASON_LABELS[reason] || reason,
        count,
      }));

    return Response.json({ types, deferral_insights, total_deferrals: deferrals.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});