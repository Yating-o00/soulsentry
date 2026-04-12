import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { task_id, action } = await req.json();

    if (!task_id) {
      return Response.json({ error: 'task_id is required' }, { status: 400 });
    }

    const task = await base44.entities.Task.get(task_id);
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const authHeader = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // Handle delete action
    if (action === 'delete' && task.google_calendar_event_id) {
      const delRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.google_calendar_event_id}`,
        { method: 'DELETE', headers: authHeader }
      );
      if (delRes.ok || delRes.status === 404 || delRes.status === 410) {
        await base44.asServiceRole.entities.Task.update(task.id, { 
          google_calendar_event_id: null, 
          gcal_sync_enabled: false 
        });
        return Response.json({ success: true, message: 'Event deleted from Google Calendar' });
      }
      const errText = await delRes.text();
      throw new Error(`Failed to delete event: ${errText}`);
    }

    // Build event payload
    const startTime = task.reminder_time ? new Date(task.reminder_time) : new Date(Date.now() + 3600000);
    const endTime = task.end_time ? new Date(task.end_time) : new Date(startTime.getTime() + 3600000);

    const categoryLabels = {
      work: '📝 工作', personal: '⚡ 生活', health: '🌱 健康',
      study: '📖 学习', family: '👨‍👩‍👧 家庭', shopping: '🛒 购物',
      finance: '💰 财务', other: '⚡ 其他'
    };

    const priorityLabels = { low: '低', medium: '中', high: '高', urgent: '紧急' };

    const descParts = [];
    if (task.description) descParts.push(task.description);
    descParts.push(`\n--- SoulSentry ---`);
    descParts.push(`分类: ${categoryLabels[task.category] || task.category}`);
    descParts.push(`优先级: ${priorityLabels[task.priority] || task.priority}`);
    if (task.tags?.length) descParts.push(`标签: ${task.tags.join(', ')}`);
    descParts.push(`状态: ${task.status}`);

    const event = {
      summary: task.title,
      description: descParts.join('\n'),
      start: task.is_all_day
        ? { date: startTime.toISOString().split('T')[0] }
        : { dateTime: startTime.toISOString(), timeZone: 'Asia/Shanghai' },
      end: task.is_all_day
        ? { date: endTime.toISOString().split('T')[0] }
        : { dateTime: endTime.toISOString(), timeZone: 'Asia/Shanghai' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 },
          { method: 'email', minutes: 30 },
        ],
      },
      colorId: task.priority === 'urgent' ? '11' : task.priority === 'high' ? '6' : task.category === 'work' ? '9' : '2',
    };

    let calendarEvent;

    // Try update first if event exists
    if (task.google_calendar_event_id) {
      const updateRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.google_calendar_event_id}`,
        { method: 'PUT', headers: authHeader, body: JSON.stringify(event) }
      );
      if (updateRes.ok) {
        calendarEvent = await updateRes.json();
      } else if (updateRes.status !== 404 && updateRes.status !== 410) {
        const errText = await updateRes.text();
        console.warn('Update failed:', errText);
      }
    }

    // Create new event if needed
    if (!calendarEvent) {
      const createRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        { method: 'POST', headers: authHeader, body: JSON.stringify(event) }
      );
      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create event: ${errText}`);
      }
      calendarEvent = await createRes.json();
    }

    // Update task with event ID
    const updateData = { gcal_sync_enabled: true };
    if (calendarEvent.id !== task.google_calendar_event_id) {
      updateData.google_calendar_event_id = calendarEvent.id;
    }
    await base44.asServiceRole.entities.Task.update(task.id, updateData);

    return Response.json({
      success: true,
      message: task.google_calendar_event_id ? 'Event updated' : 'Event created',
      eventId: calendarEvent.id,
      eventLink: calendarEvent.htmlLink,
    });
  } catch (error) {
    console.error('Google Calendar Sync Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});