import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Sentinel 地理围栏实时触发器
 * —— 当用户移动到任意 Task.location_reminder 范围内/外时：
 *   1) 复核距离，命中围栏
 *   2) 调用 sentinelBrain 对"此地此刻执行此任务"做实时适宜性判断
 *   3) 按 sentinelBrain 返回的 interruption_level/channel 调用 deliverSentinelNotification 分发
 *
 * 入参: { latitude: number, longitude: number, accuracy?: number }
 * 出参: { success, checked, triggered, results: [{task_id, event, level, delivered}] }
 *
 * 与 geofenceTrigger（基于 SavedLocation）的区别：
 *   - 本函数扫描所有启用 location_reminder 的任务
 *   - 每次命中都由 sentinelBrain 实时分析当前情境，不使用静态模板
 */

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 简易去抖：同一任务同一事件 10 分钟内只触发一次
const COOLDOWN_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { latitude, longitude, accuracy } = await req.json();
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // 拉取当前用户所有启用地点提醒、未完成的任务
    const tasks = await base44.entities.Task.filter({
      created_by: user.email,
      status: { $in: ['pending', 'in_progress', 'snoozed', 'blocked'] }
    }, '-updated_date', 200);

    const now = Date.now();
    const candidates = (tasks || []).filter((t) => {
      if (t.deleted_at) return false;
      const lr = t.location_reminder;
      if (!lr?.enabled) return false;
      if (typeof lr.latitude !== 'number' || typeof lr.longitude !== 'number') return false;
      return true;
    });

    const triggered = [];
    for (const task of candidates) {
      const lr = task.location_reminder;
      const radius = lr.radius || 300;
      const dist = distanceMeters(latitude, longitude, lr.latitude, lr.longitude);
      const isInside = dist <= radius;

      // 基于任务状态位判断「之前是否在内」—— 复用 ai_analysis.geo_state 字段
      const prevState = task.ai_analysis?.geo_state || {};
      const wasInside = !!prevState.inside;
      const lastTriggerAt = prevState.last_trigger_at ? new Date(prevState.last_trigger_at).getTime() : 0;

      let event = null;
      if (isInside && !wasInside) event = 'enter';
      else if (!isInside && wasInside) event = 'exit';
      if (!event) continue;

      // 仅响应用户设置的触发方向
      const trigOn = lr.trigger_on || 'enter';
      if (trigOn !== 'both' && trigOn !== event) {
        // 即使不发通知，也更新状态位避免误判
        await base44.asServiceRole.entities.Task.update(task.id, {
          ai_analysis: {
            ...(task.ai_analysis || {}),
            geo_state: { inside: isInside, last_seen_at: new Date().toISOString() }
          }
        }).catch(() => {});
        continue;
      }

      // 冷却期内跳过
      if (now - lastTriggerAt < COOLDOWN_MS) continue;

      triggered.push({ task, event, dist });
    }

    const results = [];
    for (const { task, event, dist } of triggered) {
      let level = task.interruption_level || 'standard';
      let delivered = [];
      let analysis = null;

      // 1) 让 sentinelBrain 实时复核「此地此刻做此事」的适宜性
      try {
        const brainRes = await base44.asServiceRole.functions.invoke('sentinelBrain', {
          task_id: task.id,
          trigger: 'geofence',
          current_location: {
            latitude, longitude, accuracy,
            name: task.location_reminder?.location_name || '当前位置',
            geofence_event: event,
            distance_m: Math.round(dist)
          }
        });
        analysis = brainRes?.data?.analysis || null;
        if (analysis?.interruption_level) level = analysis.interruption_level;
      } catch (e) {
        console.warn('[sentinelGeofence] sentinelBrain failed:', e?.message);
      }

      // 2) 写回 geo_state，避免重复触发
      try {
        const latest = await base44.asServiceRole.entities.Task.get(task.id);
        await base44.asServiceRole.entities.Task.update(task.id, {
          ai_analysis: {
            ...(latest?.ai_analysis || {}),
            geo_state: {
              inside: event === 'enter',
              last_trigger_at: new Date().toISOString(),
              last_event: event,
              last_distance_m: Math.round(dist)
            }
          }
        });
      } catch {}

      // 3) 按梯度推送
      try {
        const deliverRes = await base44.asServiceRole.functions.invoke('deliverSentinelNotification', {
          task_id: task.id
        });
        delivered = deliverRes?.data?.delivered || [];
      } catch (e) {
        console.warn('[sentinelGeofence] deliver failed:', e?.message);
      }

      results.push({
        task_id: task.id,
        task_title: task.title,
        location_name: task.location_reminder?.location_name || '',
        event,
        distance_m: Math.round(dist),
        level,
        delivered,
        context_summary: analysis?.ai_context_summary || task.ai_context_summary || ''
      });
    }

    return Response.json({
      success: true,
      checked: candidates.length,
      triggered: triggered.length,
      results
    });
  } catch (error) {
    console.error('sentinelGeofenceTrigger error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});