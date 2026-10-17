import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 通知梯度分发器 (Interruption Gradient Delivery)
 *
 * 根据任务的 interruption_level 与 delivery_channel，决定：
 *   - critical / assertive → 浏览器 WebPush + 应用内通知
 *   - standard            → 仅应用内通知
 *   - ambient             → 仅写入 Notification（红点），不打扰
 *   - silent              → 跳过
 *
 * 入参:
 *   { task_id: string, override_channel?: "in_app"|"browser"|"email"|"silent" }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { task_id, override_channel } = await req.json();
    if (!task_id) return Response.json({ error: "Missing task_id" }, { status: 400 });

    const task = await base44.entities.Task.get(task_id);
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

    const level = task.interruption_level || "standard";
    const channel = override_channel
      || task.ai_analysis?.delivery_channel
      || (level === "critical" || level === "assertive" ? "browser" : "in_app");

    const summary = task.ai_context_summary || task.description || "";
    const title = task.title || "SoulSentry 提醒";
    const body = summary
      ? (summary.length > 120 ? summary.slice(0, 117) + "..." : summary)
      : "您有一条新的提醒";

    const delivered = [];

    // silent 级别：不打扰，仅打一个用户行为日志
    if (level === "silent" || channel === "silent") {
      return Response.json({ success: true, level, channel: "silent", delivered: [] });
    }

    // 始终写一条 Notification（应用内红点）—— ambient 以上都需要
    try {
      await base44.asServiceRole.entities.Notification.create({
        recipient_id: task.created_by_id || me.id,
        type: "reminder",
        title,
        content: body,
        link: `/Tasks?taskId=${task.id}`,
        related_entity_id: task.id,
        sender_id: "sentinel"
      });
      delivered.push("in_app");
    } catch (e) {
      console.error("create Notification failed:", e);
    }

    // ambient 到此结束
    if (level === "ambient") {
      return Response.json({ success: true, level, channel: "in_app_only", delivered });
    }

    // assertive / critical / 或用户显式要求 browser → 调用 WebPush
    const shouldPush = channel === "browser" || level === "critical" || level === "assertive";
    if (shouldPush) {
      try {
        const pushRes = await base44.asServiceRole.functions.invoke("sendWebPush", {
          user_email: task.created_by,
          title: level === "critical" ? `🚨 ${title}` : title,
          body,
          url: `/Tasks?taskId=${task.id}`,
          tag: `sentinel-${task.id}`,
          data: {
            task_id: task.id,
            interruption_level: level
          }
        });
        delivered.push("browser");
        if (pushRes?.data?.error) {
          console.warn("WebPush returned error:", pushRes.data.error);
        }
      } catch (e) {
        console.error("sendWebPush failed:", e);
      }
    }

    // 标记已发送
    try {
      await base44.asServiceRole.entities.Task.update(task.id, { reminder_sent: true });
    } catch {}

    return Response.json({ success: true, level, channel, delivered });
  } catch (e) {
    console.error("deliverSentinelNotification error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});