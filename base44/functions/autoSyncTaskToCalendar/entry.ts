import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Entity automation handler: auto-sync tasks with gcal_sync_enabled to Google Calendar
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);
    
    const { event, data: taskData } = body;
    
    if (!taskData || !event) {
      return Response.json({ status: 'no_data' });
    }

    // Only sync if task has gcal_sync_enabled or already has a calendar event
    if (!taskData.gcal_sync_enabled && !taskData.google_calendar_event_id) {
      return Response.json({ status: 'skipped', reason: 'sync not enabled' });
    }

    // Skip if task has no time set
    if (!taskData.reminder_time) {
      return Response.json({ status: 'skipped', reason: 'no reminder_time' });
    }

    // Handle delete event — remove from calendar
    if (event.type === 'delete' && taskData.google_calendar_event_id) {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${taskData.google_calendar_event_id}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      return Response.json({ status: 'deleted_from_calendar' });
    }

    // For create/update — sync to calendar
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const authHeader = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    const startTime = new Date(taskData.reminder_time);
    const endTime = taskData.end_time ? new Date(taskData.end_time) : new Date(startTime.getTime() + 3600000);

    const calEvent = {
      summary: taskData.title,
      description: taskData.description || '',
      start: taskData.is_all_day
        ? { date: startTime.toISOString().split('T')[0] }
        : { dateTime: startTime.toISOString(), timeZone: 'Asia/Shanghai' },
      end: taskData.is_all_day
        ? { date: endTime.toISOString().split('T')[0] }
        : { dateTime: endTime.toISOString(), timeZone: 'Asia/Shanghai' },
      reminders: { useDefault: true },
    };

    let calendarEvent;

    if (taskData.google_calendar_event_id) {
      const updateRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${taskData.google_calendar_event_id}`,
        { method: 'PUT', headers: authHeader, body: JSON.stringify(calEvent) }
      );
      if (updateRes.ok) {
        calendarEvent = await updateRes.json();
      }
    }

    if (!calendarEvent) {
      const createRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        { method: 'POST', headers: authHeader, body: JSON.stringify(calEvent) }
      );
      if (createRes.ok) {
        calendarEvent = await createRes.json();
      } else {
        const errText = await createRes.text();
        console.error('Failed to create calendar event:', errText);
        return Response.json({ status: 'error', error: errText });
      }
    }

    // Save event ID back to task
    if (calendarEvent?.id && calendarEvent.id !== taskData.google_calendar_event_id) {
      await base44.asServiceRole.entities.Task.update(event.entity_id, {
        google_calendar_event_id: calendarEvent.id,
      });
    }

    return Response.json({ status: 'synced', eventId: calendarEvent?.id });
  } catch (error) {
    console.error('Auto sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});