import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 时空感知守护数据聚合
 * 返回两类真实数据：
 *   - geo_context: 基于 SavedLocation 的地理感知（最近触发的地点 + 当日相关待办）
 *   - forgetting_rescue: 基于遗忘曲线的沉默约定/心签（超过 3/7 天未完成 or 未更新）
 */

const FORGETTING_CURVE = [
  { days: 1, retention: 44 },
  { days: 2, retention: 28 },
  { days: 3, retention: 22 },
  { days: 7, retention: 15 },
  { days: 14, retention: 10 },
  { days: 30, retention: 5 }
];

function getForgetRate(days) {
  if (days < 1) return 0;
  const hit = FORGETTING_CURVE.find((c) => days <= c.days);
  const retention = hit ? hit.retention : 3;
  return Math.min(95, 100 - retention);
}

function daysBetween(from, to = new Date()) {
  if (!from) return 0;
  return Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24));
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let coords = null;
    try {
      const body = await req.json();
      if (body?.latitude && body?.longitude) {
        coords = { latitude: body.latitude, longitude: body.longitude };
      }
    } catch { /* no body */ }

    // ========== 1) 地理感知 ==========
    const locations = await base44.entities.SavedLocation.filter({
      created_by: user.email,
      is_active: true
    });

    let geoContext = null;
    const now = new Date();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    // 优先用当前坐标匹配地点
    let hitLocation = null;
    let hitDistance = null;
    let hitEvent = 'enter';

    if (coords && locations.length > 0) {
      for (const loc of locations) {
        const dist = haversine(coords.latitude, coords.longitude, loc.latitude, loc.longitude);
        if (dist <= (loc.radius || 200) + 100) {
          if (!hitLocation || dist < hitDistance) {
            hitLocation = loc;
            hitDistance = dist;
            hitEvent = 'enter';
          }
        }
      }
    }

    // 降级：使用最近进入/离开的地点
    if (!hitLocation && locations.length > 0) {
      const recent = locations
        .filter((l) => l.last_entered_at || l.last_exited_at)
        .sort((a, b) => {
          const ta = new Date(a.last_entered_at || a.last_exited_at || 0).getTime();
          const tb = new Date(b.last_entered_at || b.last_exited_at || 0).getTime();
          return tb - ta;
        })[0];
      if (recent) {
        const enterT = recent.last_entered_at ? new Date(recent.last_entered_at).getTime() : 0;
        const exitT = recent.last_exited_at ? new Date(recent.last_exited_at).getTime() : 0;
        hitLocation = recent;
        hitEvent = enterT >= exitT ? 'enter' : 'exit';
        const lastTime = Math.max(enterT, exitT);
        // 仅保留 2 小时内的真实数据
        if (now.getTime() - lastTime < 2 * 60 * 60 * 1000) {
          hitDistance = recent.radius || 200;
        } else {
          hitLocation = null; // 太久了，不显示
        }
      }
    }

    if (hitLocation) {
      // 找与该地点相关的当日任务
      const allActive = await base44.entities.Task.filter({
        created_by: user.email,
        status: { $in: ['pending', 'in_progress', 'snoozed'] }
      }, '-priority', 30);

      const CATEGORY_MAP = {
        office: ['work'], home: ['personal', 'family', 'health'],
        gym: ['health'], school: ['study'], shopping: ['shopping'],
        hospital: ['health'], restaurant: ['personal']
      };
      const related = (CATEGORY_MAP[hitLocation.location_type] || []);

      const relevantTasks = (allActive || [])
        .filter((t) => !t.deleted_at)
        .map((t) => {
          let score = 0;
          if (t.reminder_time) {
            const rt = new Date(t.reminder_time);
            if (rt >= todayStart && rt <= todayEnd) score += 40;
            if (rt < now) score += 25; // 超期
          }
          if (related.includes(t.category)) score += 20;
          if (t.priority === 'urgent') score += 30;
          else if (t.priority === 'high') score += 20;
          const lr = t.location_reminder;
          if (lr?.enabled && typeof lr.latitude === 'number') {
            const d = haversine(hitLocation.latitude, hitLocation.longitude, lr.latitude, lr.longitude);
            if (d < (hitLocation.radius || 300) + 500) score += 35;
          }
          return { task: t, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => ({
          id: x.task.id,
          title: x.task.title,
          time: x.task.reminder_time,
          priority: x.task.priority,
          overdue: x.task.reminder_time ? new Date(x.task.reminder_time) < now : false
        }));

      if (relevantTasks.length > 0) {
        geoContext = {
          location_id: hitLocation.id,
          location_name: hitLocation.name,
          location_type: hitLocation.location_type,
          icon: hitLocation.icon || '📍',
          event: hitEvent,
          distance: Math.round(hitDistance || hitLocation.radius || 200),
          tasks: relevantTasks
        };
      }
    }

    // ========== 2) 遗忘拯救 ==========
    const allTasks = await base44.entities.Task.filter({
      created_by: user.email,
      status: { $in: ['pending', 'in_progress', 'snoozed'] }
    }, '-created_date', 80);

    const silentTasks = (allTasks || [])
      .filter((t) => !t.deleted_at)
      .map((t) => {
        const refDate = t.reminder_time || t.created_date;
        const days = daysBetween(refDate);
        return { task: t, days, forgetRate: getForgetRate(days) };
      })
      .filter((x) => x.days >= 3 && x.forgetRate >= 60)
      .sort((a, b) => b.forgetRate - a.forgetRate)
      .slice(0, 3);

    // 同时看看沉默心签（>= 14 天未活动）
    const notes = await base44.entities.Note.filter({
      created_by: user.email
    }, '-updated_date', 30);
    const silentNotes = (notes || [])
      .filter((n) => !n.deleted_at)
      .map((n) => {
        const refDate = n.last_active_at || n.updated_date || n.created_date;
        return { note: n, days: daysBetween(refDate) };
      })
      .filter((x) => x.days >= 14)
      .sort((a, b) => b.days - a.days)
      .slice(0, 2);

    const forgettingRescue = silentTasks.length > 0 ? {
      primary: {
        id: silentTasks[0].task.id,
        title: silentTasks[0].task.title,
        days: silentTasks[0].days,
        forget_rate: silentTasks[0].forgetRate,
        context: silentTasks[0].task.description
          || silentTasks[0].task.ai_context_summary
          || `${silentTasks[0].days}天前创建，至今未处理`,
        overdue_days: silentTasks[0].task.reminder_time
          ? Math.max(0, daysBetween(silentTasks[0].task.reminder_time))
          : 0
      },
      others: silentTasks.slice(1).map((x) => ({
        id: x.task.id, title: x.task.title, days: x.days, forget_rate: x.forgetRate
      })),
      silent_notes: silentNotes.map((x) => ({
        id: x.note.id,
        title: (x.note.plain_text || x.note.content || '').slice(0, 30) || '未命名心签',
        days: x.days
      }))
    } : null;

    return Response.json({
      success: true,
      geo_context: geoContext,
      forgetting_rescue: forgettingRescue,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('getSentinelGuard error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});