import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { task, minutes_before = 60 } = await req.json();

    if (!task || !task.title || !task.reminder_time) {
      return Response.json({ error: 'Task with title and reminder_time is required' }, { status: 400 });
    }

    // 获取 Google Calendar Access Token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlecalendar");

    // 计算开始和结束时间
    const startTime = new Date(task.reminder_time);
    const endTime = new Date(startTime.getTime() + (60 * 60 * 1000)); // 默认1小时时长

    const event = {
      summary: task.title,
      description: task.description || "",
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "UTC" // 用户时区
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "UTC"
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: minutes_before }, // 邮件提醒
          { method: 'popup', minutes: 30 }
        ]
      }
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(`Google Calendar API error: ${JSON.stringify(errorData)}`);
    }

    const data = await res.json();

    return Response.json({ 
      success: true, 
      message: 'Event created in Google Calendar with email reminder',
      event_id: data.id,
      htmlLink: data.htmlLink
    });

  } catch (error) {
    console.error('Error creating calendar event:', error);
    return Response.json({ 
      error: error.message || 'Failed to create calendar event' 
    }, { status: 500 });
  }
});