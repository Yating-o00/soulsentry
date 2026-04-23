import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 实体自动化入口：当 Task 创建/更新时，自动触发 sentinelBrain 进行情境分析。
 *
 * 避免无限循环：如果本次更新是由 sentinelBrain 自己触发（只改了 sentinel_* / ai_context_summary 等字段），
 * 则跳过重新分析。
 */

const SENTINEL_ONLY_FIELDS = new Set([
  "sentinel_analyzed_at",
  "ai_context_summary",
  "interruption_score",
  "interruption_level",
  "is_waiting_for_reply",
  "waiting_for",
  "silence_followup_at",
  "forgetting_risk",
  "last_forgetting_check",
  "optimal_reminder_time",
  "ai_analysis"
]);

// 对哨兵分析有实质影响的字段
const MATERIAL_FIELDS = new Set([
  "title", "description", "category", "priority",
  "reminder_time", "end_time", "status", "is_all_day",
  "location_reminder", "repeat_rule"
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const payload = await req.json();
    const { event, data, old_data, changed_fields } = payload || {};
    if (!event || !data) return Response.json({ skipped: "no event data" });
    if (event.type === "delete") return Response.json({ skipped: "delete event" });

    const taskId = event.entity_id || data.id;
    if (!taskId) return Response.json({ skipped: "no task id" });

    // 已完成/已取消/已删除的任务不再分析
    if (["completed", "cancelled"].includes(data.status)) {
      return Response.json({ skipped: "task closed" });
    }
    if (data.deleted_at) return Response.json({ skipped: "soft deleted" });

    // update 事件：判断是否值得重新分析
    if (event.type === "update") {
      const fields = Array.isArray(changed_fields) ? changed_fields : [];
      if (fields.length === 0) return Response.json({ skipped: "no changed fields" });

      // 如果本次变更的字段全是哨兵自己写的 → 跳过
      const onlySentinelChanges = fields.every(f => SENTINEL_ONLY_FIELDS.has(f));
      if (onlySentinelChanges) {
        return Response.json({ skipped: "sentinel self-update" });
      }

      // 如果没有任何实质字段变更 → 跳过
      const hasMaterial = fields.some(f => MATERIAL_FIELDS.has(f));
      if (!hasMaterial) return Response.json({ skipped: "no material change" });
    }

    // 调用 sentinelBrain（服务端调用，需带上当前 task 的 created_by 身份）
    const result = await base44.asServiceRole.functions.invoke("sentinelBrain", {
      task_id: taskId,
      trigger: event.type === "create" ? "create" : "update"
    });

    return Response.json({ success: true, brain_result: result });
  } catch (e) {
    console.error("sentinelAutoTrigger error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});