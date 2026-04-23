import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Haversine formula: calculate distance between two lat/lng points in meters
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 拉取未来 windowMinutes 分钟内的 Google Calendar 事件（若已授权）
async function fetchUpcomingCalendarEvents(base44, windowMinutes = 240) {
  try {
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    if (!accessToken) return [];
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?`
      + `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
      + `&singleEvents=true&orderBy=startTime&maxResults=10`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((e) => ({
      id: e.id,
      summary: e.summary || '(无标题)',
      start: e.start?.dateTime || e.start?.date,
      location: e.location || '',
      hangoutLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri || ''
    }));
  } catch {
    return [];
  }
}

async function callKimi(prompt) {
  const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: "kimi-k2-turbo-preview",
        messages: [
          {
            role: "system",
            content: "你是用户的贴心日程助手。根据用户到达/离开的地点和当前待办，生成一条简洁、温暖、有行动建议的情境提醒。严格按JSON格式返回：{\"title\":\"标题（10字内）\",\"message\":\"正文（50字内）\",\"top_tasks\":[\"最重要的1-3条待办标题\"]}"
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { latitude, longitude } = await req.json();
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // Get user's active saved locations
    const locations = await base44.entities.SavedLocation.filter({
      created_by: user.email,
      is_active: true
    });

    const now = new Date();
    const triggered = [];

    for (const loc of locations) {
      const distance = getDistanceMeters(latitude, longitude, loc.latitude, loc.longitude);
      const isInside = distance <= (loc.radius || 200);
      const wasInside = loc.last_entered_at && (!loc.last_exited_at || new Date(loc.last_entered_at) > new Date(loc.last_exited_at));

      const quietMs = (loc.quiet_minutes || 30) * 60 * 1000;

      // ENTER event
      if (isInside && !wasInside) {
        const lastEnter = loc.last_entered_at ? new Date(loc.last_entered_at) : null;
        if (!lastEnter || (now - lastEnter) > quietMs) {
          if (loc.trigger_on === 'enter' || loc.trigger_on === 'both') {
            triggered.push({ location: loc, event: 'enter' });
          }
          await base44.entities.SavedLocation.update(loc.id, { last_entered_at: now.toISOString() });
        }
      }

      // EXIT event
      if (!isInside && wasInside) {
        const lastExit = loc.last_exited_at ? new Date(loc.last_exited_at) : null;
        if (!lastExit || (now - lastExit) > quietMs) {
          if (loc.trigger_on === 'exit' || loc.trigger_on === 'both') {
            triggered.push({ location: loc, event: 'exit' });
          }
          await base44.entities.SavedLocation.update(loc.id, { last_exited_at: now.toISOString() });
        }
      }
    }

    // For each triggered event, get relevant tasks and generate AI reminder
    const reminders = [];
    for (const t of triggered) {
      // Fetch pending tasks relevant to this location
      const allTasks = await base44.entities.Task.filter({
        created_by: user.email,
        status: 'pending'
      }, '-reminder_time', 20);

      const activeTasks = allTasks.filter(task => !task.deleted_at);

      // Build context for AI
      const taskSummary = activeTasks.slice(0, 10).map(t =>
        `- [${t.priority || 'medium'}] ${t.title}${t.reminder_time ? ` (计划: ${new Date(t.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })})` : ''}`
      ).join('\n');

      // 拉取未来 4 小时内的日历会议
      const upcomingEvents = await fetchUpcomingCalendarEvents(base44, 240);
      const eventSummary = upcomingEvents.slice(0, 5).map((ev) => {
        const startStr = ev.start
          ? new Date(ev.start).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          : '时间未定';
        const loc = ev.location ? ` @ ${ev.location}` : '';
        const link = ev.hangoutLink ? ' [线上会议]' : '';
        return `- ${ev.summary} (开始: ${startStr})${loc}${link}`;
      }).join('\n');

      const eventText = t.event === 'enter' ? '刚刚到达' : '刚刚离开';
      const prompt = `用户${eventText}【${t.location.name}】（类型：${t.location.location_type}）。

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

用户待办清单：
${taskSummary || '（暂无待办）'}

未来4小时内的日历会议：
${eventSummary || '（无即将开始的会议）'}

请综合考虑地点、待办和即将开始的会议，生成情境化提醒：
- 若有会议即将开始（尤其是30分钟内），优先提醒会议（含开始时间/地点/是否线上）；
- 到达公司推送工作任务与会议；到达商场推送购物清单；离开公司推送生活待办；
- 挑选最相关的1-3条，top_tasks 中同时可包含任务标题和会议标题。`;

      const aiResult = await callKimi(prompt);

      const title = aiResult?.title || (t.event === 'enter' ? `到达${t.location.name}` : `离开${t.location.name}`);
      const message = aiResult?.message || `您已${eventText}${t.location.name}`;

      // Create notification
      const notif = await base44.entities.Notification.create({
        recipient_id: user.id,
        type: 'reminder',
        title: `${t.location.icon || '📍'} ${title}`,
        content: message,
        link: '/Tasks',
        related_entity_id: t.location.id
      });

      // 发送 Web Push：即使页面已关闭，SW 也能接收并弹出系统通知
      let pushed = false;
      try {
        const pushBody = aiResult?.top_tasks?.length
          ? `${message}\n待办：${aiResult.top_tasks.slice(0, 3).join('、')}`
          : message;
        await base44.functions.invoke('sendWebPush', {
          title: `${t.location.icon || '📍'} ${title}`,
          body: pushBody,
          url: '/Tasks',
          tag: `geofence-${t.location.id}`,
          data: {
            location_id: t.location.id,
            location_name: t.location.name,
            event: t.event,
            notification_id: notif.id
          }
        });
        pushed = true;
      } catch (pushErr) {
        console.warn('[geofence] web push failed:', pushErr?.message);
      }

      reminders.push({
        event: t.event,
        location_name: t.location.name,
        title,
        message,
        top_tasks: aiResult?.top_tasks || [],
        calendar_events: upcomingEvents.slice(0, 5),
        notification_id: notif.id,
        pushed
      });

      // 决策预加载：对「公司、家」等关键地点额外触发 sentinelLocationDigest
      const keyTypes = ['office', 'home', 'school', 'gym'];
      if (keyTypes.includes(t.location.location_type)) {
        try {
          await base44.functions.invoke('sentinelLocationDigest', {
            location_id: t.location.id,
            event: t.event
          });
        } catch (digestErr) {
          console.warn('[geofence] sentinelLocationDigest failed:', digestErr?.message);
        }
      }
    }

    return Response.json({
      success: true,
      checked: locations.length,
      triggered: triggered.length,
      reminders
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});