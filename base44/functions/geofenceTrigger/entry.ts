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

    // 地点类型 → 关键词词典（用于把"虽然没绑坐标、但内容相关"的待办自动关联到此地）
    const LOCATION_KEYWORDS = {
      shopping: ['买', '购', '购物', '采购', '超市', '商场', '日用', '牛奶', '鸡蛋', '蔬菜', '水果', '零食', '洗衣液', '纸巾', '柴米油盐'],
      restaurant: ['吃', '聚餐', '订餐', '点单', '外卖', '约饭'],
      gym: ['健身', '锻炼', '跑步', '运动', '瑜伽', '游泳'],
      hospital: ['医院', '看病', '复诊', '检查', '体检', '挂号', '取药', '配药'],
      school: ['作业', '上课', '考试', '复习', '老师', '接孩子', '送孩子'],
      office: ['汇报', '会议', '报告', '开会', '同事', '客户', '提案', '方案', '需求'],
      home: ['家务', '打扫', '洗衣', '做饭', '收拾', '家人', '父母', '孩子', '老婆', '老公'],
      other: ['快递', '包裹', '取件', '寄件', '丰巢', '菜鸟', '驿站']
    };

    // For each triggered event, get relevant tasks and generate AI reminder
    const reminders = [];
    for (const t of triggered) {
      // Fetch pending tasks relevant to this location
      const allTasks = await base44.entities.Task.filter({
        created_by: user.email,
        status: 'pending'
      }, '-reminder_time', 50);

      const activeTasks = allTasks.filter(task => !task.deleted_at);

      // —— 关键词预筛：按地点类型和地点名匹配任务文本，强相关任务置顶 ——
      const locName = (t.location.name || '').toLowerCase();
      const typeKeywords = LOCATION_KEYWORDS[t.location.location_type] || [];
      // 把"地点名本身"也作为关键词（如保存的地点叫"丰巢快递柜"，则"丰巢""快递柜"都可参与匹配）
      const nameTokens = locName.split(/[\s\/,，·\-]+/).filter(s => s.length >= 2);
      const allKeywords = Array.from(new Set([...typeKeywords, ...nameTokens]));

      const scoreTask = (task) => {
        const text = `${task.title || ''} ${task.description || ''} ${(task.tags || []).join(' ')}`.toLowerCase();
        let score = 0;
        for (const kw of allKeywords) {
          if (text.includes(kw.toLowerCase())) score += 2;
        }
        // 任务已设定的 location_reminder 也加分（用户显式标记过）
        if (task.location_reminder?.enabled && task.location_reminder?.location_name) {
          const tlName = task.location_reminder.location_name.toLowerCase();
          if (tlName === locName || locName.includes(tlName) || tlName.includes(locName)) score += 5;
        }
        // 高优先级加分
        if (task.priority === 'urgent') score += 1.5;
        else if (task.priority === 'high') score += 1;
        return score;
      };

      const scored = activeTasks
        .map(task => ({ task, score: scoreTask(task) }))
        .sort((a, b) => b.score - a.score);
      const relatedTasks = scored.filter(s => s.score > 0).map(s => s.task);
      const fallbackTasks = scored.slice(0, 8).map(s => s.task);
      // 优先用"强相关任务"，没有则退回到最近的待办
      const tasksForPrompt = relatedTasks.length > 0 ? relatedTasks.slice(0, 8) : fallbackTasks;

      // Build context for AI
      const taskSummary = tasksForPrompt.map(t =>
        `- [${t.priority || 'medium'}] ${t.title}${t.reminder_time ? ` (计划: ${new Date(t.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })})` : ''}`
      ).join('\n');

      const hasStrongMatch = relatedTasks.length > 0;

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

${hasStrongMatch ? '⚡ 上述待办经关键词匹配，与此地点强相关，请优先纳入 top_tasks。' : '（上述待办未必与此地点直接相关，若确有关联再提及，否则只给一句轻提醒即可）'}

请生成情境化提醒：
1) 若有会议在30分钟内开始 → 优先提醒会议（含开始时间/地点/是否线上）；
2) 若有强相关待办（如到快递站碰到取快递、到超市碰到购物清单）→ 直接列 1-3 条到 top_tasks；
3) 若既无紧迫会议也无相关待办 → title 简短欢迎，message 一句话即可，top_tasks 留空数组；
4) message 控制在50字内，温暖、有行动感。`;

      const aiResult = await callKimi(prompt);

      const title = aiResult?.title || (t.event === 'enter' ? `到达${t.location.name}` : `离开${t.location.name}`);
      const message = aiResult?.message || `您已${eventText}${t.location.name}`;

      // 不再写 Notification（避免堆积在通知中心）；改为：
      //   1) 创建一个 15 分钟短日历事件（用户翻日历能回看到）
      //   2) WebPush（系统级即时弹窗）
      //   3) 返回给前端，由 GeofenceTracker 弹 sonner toast
      let calendarEventId = null;
      try {
        const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
        if (accessToken) {
          const start = new Date();
          const end = new Date(start.getTime() + 15 * 60 * 1000);
          const tasksLine = aiResult?.top_tasks?.length ? `\n· ${aiResult.top_tasks.slice(0, 3).join('\n· ')}` : '';
          const evt = {
            summary: `${t.location.icon || '📍'} ${title}`,
            description: `${message}${tasksLine}\n\n— SoulSentry · 地点提醒`,
            start: { dateTime: start.toISOString(), timeZone: 'Asia/Shanghai' },
            end: { dateTime: end.toISOString(), timeZone: 'Asia/Shanghai' },
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
            colorId: '5',
            transparency: 'transparent'
          };
          const cr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(evt)
          });
          if (cr.ok) {
            const ev = await cr.json();
            calendarEventId = ev.id;
          }
        }
      } catch (calErr) {
        console.warn('[geofence] calendar create failed:', calErr?.message);
      }

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
            calendar_event_id: calendarEventId
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
        calendar_event_id: calendarEventId,
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