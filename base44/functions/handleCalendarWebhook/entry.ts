import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);
    
    const state = body.data?._provider_meta?.['x-goog-resource-state'];
    
    // Acknowledge sync notification
    if (state === 'sync') {
      return Response.json({ status: 'sync_ack' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Load sync token
    const existing = await base44.asServiceRole.entities.SyncState.list();
    const syncRecord = existing.length > 0 ? existing[0] : null;

    let url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=50&singleEvents=true';
    if (syncRecord?.sync_token) {
      url += `&syncToken=${syncRecord.sync_token}`;
    } else {
      url += '&timeMin=' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    let res = await fetch(url, { headers: authHeader });
    
    // Handle expired sync token
    if (res.status === 410) {
      url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=50&singleEvents=true'
        + '&timeMin=' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      res = await fetch(url, { headers: authHeader });
    }

    if (!res.ok) {
      console.error('Calendar API error:', res.status, await res.text());
      return Response.json({ status: 'api_error' }, { status: 500 });
    }

    // Drain all pages
    const allItems = [];
    let pageData = await res.json();
    let newSyncToken = null;

    while (true) {
      allItems.push(...(pageData.items || []));
      if (pageData.nextSyncToken) newSyncToken = pageData.nextSyncToken;
      if (!pageData.nextPageToken) break;
      const nextUrl = url + `&pageToken=${pageData.nextPageToken}`;
      const nextRes = await fetch(nextUrl, { headers: authHeader });
      if (!nextRes.ok) break;
      pageData = await nextRes.json();
    }

    console.log(`Processing ${allItems.length} changed calendar events`);

    // Process changed events — match with existing tasks
    for (const event of allItems) {
      if (!event.id) continue;

      // Find matching task by google_calendar_event_id
      const matchingTasks = await base44.asServiceRole.entities.Task.filter({
        google_calendar_event_id: event.id
      });

      if (matchingTasks.length === 0) continue; // Only sync events we created

      const task = matchingTasks[0];

      // Handle deleted/cancelled events
      if (event.status === 'cancelled') {
        await base44.asServiceRole.entities.Task.update(task.id, {
          google_calendar_event_id: null,
          gcal_sync_enabled: false,
        });
        console.log(`Unlinked cancelled event from task: ${task.title}`);
        continue;
      }

      // Extract updated times from event
      const updateData = {};
      
      if (event.start) {
        const newStart = event.start.dateTime || event.start.date;
        if (newStart) {
          updateData.reminder_time = new Date(newStart).toISOString();
          updateData.is_all_day = !event.start.dateTime;
        }
      }
      
      if (event.end) {
        const newEnd = event.end.dateTime || event.end.date;
        if (newEnd) {
          updateData.end_time = new Date(newEnd).toISOString();
        }
      }

      // Update title if changed
      if (event.summary && event.summary !== task.title) {
        updateData.title = event.summary;
      }

      if (Object.keys(updateData).length > 0) {
        await base44.asServiceRole.entities.Task.update(task.id, updateData);
        console.log(`Updated task "${task.title}" from calendar event`);
      }
    }

    // Save new sync token
    if (newSyncToken) {
      const tokenData = { 
        sync_token: newSyncToken, 
        last_synced_at: new Date().toISOString() 
      };
      if (syncRecord) {
        await base44.asServiceRole.entities.SyncState.update(syncRecord.id, tokenData);
      } else {
        await base44.asServiceRole.entities.SyncState.create(tokenData);
      }
    }

    return Response.json({ 
      status: 'ok', 
      processed: allItems.length,
      syncTokenSaved: !!newSyncToken
    });
  } catch (error) {
    console.error('Calendar webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});