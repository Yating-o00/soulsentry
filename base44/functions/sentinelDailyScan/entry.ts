import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 每日定时扫描（admin-only，通常由计划任务自动化触发）：
 * - 遍历所有活跃且未完成的任务
 * - 对"超过 7 天未被哨兵分析过"或"遗忘风险高且临近截止"的任务重新分析
 * - 对 silence_followup_at 到期的沉默任务也重新分析
 */

const STALE_DAYS = 7;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") {
      return Response.json({ error: "Forbidden: admin only" }, { status: 403 });
    }

    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const tasks = await base44.asServiceRole.entities.Task.filter({
      status: { $in: ["pending", "in_progress", "snoozed", "blocked"] }
    }, "-updated_date", 500);

    const toReanalyze = [];
    for (const t of (tasks || [])) {
      if (t.deleted_at) continue;

      const lastAnalyzed = t.sentinel_analyzed_at;
      const silenceDue = t.silence_followup_at && new Date(t.silence_followup_at) <= now;
      const neverAnalyzed = !lastAnalyzed;
      const stale = lastAnalyzed && lastAnalyzed < staleBefore;

      if (neverAnalyzed || stale || silenceDue) {
        toReanalyze.push(t.id);
      }
    }

    // 限流：一次最多处理 30 条，避免 Kimi 雪崩
    const BATCH = toReanalyze.slice(0, 30);
    const results = [];
    for (const taskId of BATCH) {
      try {
        const r = await base44.asServiceRole.functions.invoke("sentinelBrain", {
          task_id: taskId,
          trigger: "scheduled"
        });
        results.push({ task_id: taskId, ok: true });
      } catch (err) {
        results.push({ task_id: taskId, ok: false, error: err.message });
      }
    }

    return Response.json({
      success: true,
      total_scanned: tasks?.length || 0,
      queued: toReanalyze.length,
      processed: results.length,
      results
    });
  } catch (e) {
    console.error("sentinelDailyScan error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});