import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { task_id } = await req.json();

    if (!task_id) {
      return Response.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // 获取任务详情
    const task = await base44.entities.Task.get(task_id);
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    // 获取 Google Calendar Access Token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlecalendar");

    // 计算开始和结束时间
    // 默认使用任务的提醒时间作为开始时间，如果未设置则使用当前时间 + 1小时
    const startTime = task.reminder_time ? new Date(task.reminder_time) : new Date(Date.now() + 3600000);
    // 默认持续1小时，除非有结束时间
    const endTime = task.end_time ? new Date(task.end_time) : new Date(startTime.getTime() + 3600000);

    const event = {
      summary: task.title,
      description: task.description || '',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC' // 建议使用 UTC 或用户时区
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 }, // 提前1小时发送邮件
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    let calendarEvent;
    
    // 如果已有关联事件ID，尝试更新
    if (task.google_calendar_event_id) {
      try {
        const updateRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.google_calendar_event_id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });

        if (updateRes.ok) {
          calendarEvent = await updateRes.json();
        } else if (updateRes.status === 404 || updateRes.status === 410) {
          // 事件不存在或已删除，将创建新事件
          console.log("Existing event not found, creating new one");
        } else {
          const errorText = await updateRes.text();
          throw new Error(`Failed to update Google Calendar event: ${errorText}`);
        }
      } catch (e) {
        console.warn("Update failed, trying to create new event", e);
      }
    }

    // 如果未更新成功（包括没有ID或更新失败/事件不存在），则创建新事件
    if (!calendarEvent) {
      const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!createRes.ok) {
        const errorText = await createRes.text();
        throw new Error(`Failed to create Google Calendar event: ${errorText}`);
      }

      calendarEvent = await createRes.json();
    }

    // 更新任务的 google_calendar_event_id
    if (calendarEvent.id !== task.google_calendar_event_id) {
      await base44.entities.Task.update(task.id, {
        google_calendar_event_id: calendarEvent.id
      });
    }

    return Response.json({ 
      success: true, 
      message: 'Synced to Google Calendar', 
      eventLink: calendarEvent.htmlLink 
    });

  } catch (error) {
    console.error('Google Calendar Sync Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});