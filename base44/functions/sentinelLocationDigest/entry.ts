import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Sentinel 地点决策预加载 (Location Decision Preload)
 *
 * 当用户到达/离开「公司、家」等特定地点时触发：
 *   1) 拉取当日待办 + 未来 4h 日历事件
 *   2) 调用 Kimi 生成"决策预加载摘要"——最相关的 1-3 件事 + 一句情境化导语
 *   3) 落成一条 Notification + WebPush 推送
 *
 * 入参:
 *   { location_id: string (SavedLocation.id), event: "enter"|"exit" }
 * 出参:
 *   { success, digest: {title, message, top_items}, notification_id, pushed }
 */

const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions';

async function callKimi(prompt) {
  const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
  if (!apiKey) return null;
  try {
    const res = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'kimi-k2-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `你是 SoulSentry 的决策预加载官。用户刚到达/离开某个地点，请根据当日待办和即将开始的会议，挑出此地此刻最值得预加载到脑子里的 1-3 件事。
输出要求：温暖、有行动感、反焦虑；不罗列全部待办；语言简洁。
严格按 JSON 返回：{"title":"≤12字","message":"≤60字情境化导语","top_items":["≤20字的事项", ...]}`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch {
    return null;
  }
}

async function fetchUpcomingCalendar(base44, windowMin = 240) {
  try {
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    if (!accessToken) return [];
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + windowMin * 60 * 1000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=8`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items || []).map((e) => ({
      summary: e.summary || '(无标题)',
      start: e.start?.dateTime || e.start?.date,
      location: e.location || ''
    }));
  } catch {
    return [];
  }
}

function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { location_id, event } = await req.json();
    if (!location_id || !event) {
      return Response.json({ error: 'Missing location_id or event' }, { status: 400 });
    }

    const loc = await base44.entities.SavedLocation.get(location_id);
    if (!loc) return Response.json({ error: 'Location not found' }, { status: 404 });

    // 拉取当日待办（含已超期未完成）
    const todayStart = startOfDayISO();
    const todayEnd = endOfDayISO();
    const allPending = await base44.entities.Task.filter({
      created_by: user.email,
      status: { $in: ['pending', 'in_progress', 'snoozed'] }
    }, '-priority', 50);

    const activeTasks = (allPending || []).filter((t) => !t.deleted_at);

    // 与此地点相关的任务优先：
    //  - 任务绑定了本地点坐标（距离 < radius+500m 视为相关）
    //  - 类别与地点类型匹配（office→work, home→personal/family 等）
    const CATEGORY_MAP = {
      office: ['work'], home: ['personal', 'family', 'health'],
      gym: ['health'], shopping: ['shopping'], school: ['study'], hospital: ['health']
    };
    const relatedCategories = CATEGORY_MAP[loc.location_type] || [];

    const ranked = activeTasks.map((t) => {
      let score = 0;
      // 今日到期
      if (t.reminder_time) {
        const rt = new Date(t.reminder_time).toISOString();
        if (rt >= todayStart && rt <= todayEnd) score += 40;
        if (new Date(t.reminder_time) < new Date()) score += 30; // 已超期
      }
      // 分类匹配
      if (relatedCategories.includes(t.category)) score += 20;
      // 优先级
      if (t.priority === 'urgent') score += 30;
      else if (t.priority === 'high') score += 20;
      else if (t.priority === 'medium') score += 5;
      // 地点强绑定
      const lr = t.location_reminder;
      if (lr?.enabled && typeof lr.latitude === 'number') {
        const R = 6371000, toRad = (v) => v * Math.PI / 180;
        const dLat = toRad(lr.latitude - loc.latitude);
        const dLon = toRad(lr.longitude - loc.longitude);
        const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(loc.latitude)) * Math.cos(toRad(lr.latitude)) * Math.sin(dLon / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(a));
        if (dist < (loc.radius || 300) + 500) score += 35;
      }
      // 遗忘风险
      if (t.forgetting_risk === 'high') score += 15;
      else if (t.forgetting_risk === 'medium') score += 8;
      return { task: t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.task);

    const upcoming = await fetchUpcomingCalendar(base44, 240);

    const eventLabel = event === 'enter' ? '刚到达' : '刚离开';
    const taskLines = ranked.map((t) => {
      const tm = t.reminder_time
        ? new Date(t.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        : '无时间';
      return `- [${t.priority || 'medium'}] ${t.title} (${tm})`;
    }).join('\n') || '（无当日待办）';
    const calLines = upcoming.map((e) => {
      const tm = e.start ? new Date(e.start).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '时间未定';
      return `- ${e.summary} @ ${tm}${e.location ? ` / ${e.location}` : ''}`;
    }).join('\n') || '（未来 4 小时无会议）';

    const prompt = `用户${eventLabel}【${loc.name}】（类型：${loc.location_type}）。
当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

当日待办（已按相关性排序，最多 8 条）：
${taskLines}

未来 4 小时内的日历事件：
${calLines}

请生成决策预加载摘要：挑出此地此刻最值得立即处理/心中预演的 1-3 件事。`;

    const digest = await callKimi(prompt) || {
      title: event === 'enter' ? `到达${loc.name}` : `离开${loc.name}`,
      message: `为你预加载了 ${ranked.length} 件相关事项`,
      top_items: ranked.slice(0, 3).map((t) => t.title)
    };

    // 写 Notification
    const notif = await base44.asServiceRole.entities.Notification.create({
      recipient_id: user.id,
      type: 'reminder',
      title: `${loc.icon || '📍'} ${digest.title || (event === 'enter' ? '到达提醒' : '离开提醒')}`,
      content: `${digest.message || ''}${digest.top_items?.length ? `\n· ${digest.top_items.join('\n· ')}` : ''}`,
      link: '/Tasks',
      related_entity_id: loc.id,
      sender_id: 'sentinel'
    }).catch(() => null);

    // WebPush
    let pushed = false;
    try {
      await base44.asServiceRole.functions.invoke('sendWebPush', {
        title: `${loc.icon || '📍'} ${digest.title || loc.name}`,
        body: `${digest.message || ''}${digest.top_items?.length ? '\n' + digest.top_items.slice(0, 3).join('、') : ''}`,
        url: '/Tasks',
        tag: `sentinel-loc-${loc.id}`,
        data: { location_id: loc.id, event, source: 'sentinelLocationDigest' }
      });
      pushed = true;
    } catch (e) {
      console.warn('[sentinelLocationDigest] webpush failed:', e?.message);
    }

    return Response.json({
      success: true,
      location: { id: loc.id, name: loc.name, type: loc.location_type },
      event,
      digest,
      top_tasks: ranked.slice(0, 3).map((t) => ({ id: t.id, title: t.title })),
      notification_id: notif?.id || null,
      pushed
    });
  } catch (error) {
    console.error('sentinelLocationDigest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});