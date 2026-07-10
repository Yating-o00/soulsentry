import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    const state = body.data?._provider_meta?.['x-goog-resource-state'];
    if (state === 'sync') {
      return Response.json({ status: 'sync_ack' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Load sync token
    const existing = await base44.asServiceRole.entities.SyncState.list();
    const syncRecord = existing.length > 0 ? existing[0] : null;

    const baseUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=100&singleEvents=true';
    let url = baseUrl + (syncRecord?.sync_token
      ? `&syncToken=${syncRecord.sync_token}`
      : '&timeMin=' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    let res = await fetch(url, { headers: authHeader });

    // Handle expired sync token
    if (res.status === 410) {
      url = baseUrl + '&timeMin=' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      res = await fetch(url, { headers: authHeader });
    }

    if (!res.ok) {
      console.error('Calendar API error:', res.status, await res.text());
      return Response.json({ status: 'api_error', code: res.status });
    }

    // Drain all pages
    const allItems = [];
    let pageData = await res.json();
    let newSyncToken = null;

    while (true) {
      allItems.push(...(pageData.items || []));
      if (pageData.nextSyncToken) newSyncToken = pageData.nextSyncToken;
      if (!pageData.nextPageToken) break;
      const nextRes = await fetch(url + `&pageToken=${pageData.nextPageToken}`, { headers: authHeader });
      if (!nextRes.ok) break;
      pageData = await nextRes.json();
    }

    console.log(`Processing ${allItems.length} changed calendar events`);

    let updated = 0;
    let imported = 0;
    let unlinked = 0;

    for (const event of allItems) {
      if (!event.id) continue;

      const matchingTasks = await base44.asServiceRole.entities.Task.filter({
        google_calendar_event_id: event.id
      });

      // —— 未匹配到约定：Google 端直接新建的事件 → 导入为约定（仅未来、未取消的事件）
      if (matchingTasks.length === 0) {
        if (event.status === 'cancelled' || !event.summary) continue;
        const startRaw = event.start?.dateTime || event.start?.date;
        if (!startRaw) continue;
        const startMs = new Date(startRaw).getTime();
        if (Number.isNaN(startMs) || startMs < Date.now() - 60 * 60 * 1000) continue;

        // 防重复：同名且时间相近的约定已存在则只回填 event_id（覆盖"事件刚创建、event_id 还没写回"的竞态）
        const sameTitle = await base44.asServiceRole.entities.Task.filter({ title: event.summary });
        const dup = sameTitle.find(t =>
          !t.deleted_at && t.reminder_time &&
          Math.abs(new Date(t.reminder_time).getTime() - startMs) < 5 * 60 * 1000
        );
        if (dup) {
          if (!dup.google_calendar_event_id) {
            await base44.asServiceRole.entities.Task.update(dup.id, {
              google_calendar_event_id: event.id,
              gcal_sync_enabled: true,
            });
          }
          continue;
        }

        const isAllDay = !event.start?.dateTime;
        const endRaw = event.end?.dateTime || event.end?.date;
        let endIso = null;
        if (endRaw) {
          let endMs = new Date(endRaw).getTime();
          if (isAllDay) endMs -= 24 * 60 * 60 * 1000; // Google 全天事件 end.date 为排他，需减 1 天
          if (endMs > startMs) endIso = new Date(endMs).toISOString();
        }

        await base44.asServiceRole.entities.Task.create({
          title: event.summary,
          description: event.description || '',
          reminder_time: new Date(startMs).toISOString(),
          ...(endIso ? { end_time: endIso } : {}),
          is_all_day: isAllDay,
          category: 'other',
          google_calendar_event_id: event.id,
          gcal_sync_enabled: true,
        });
        imported++;
        console.log(`Imported new event from Google: ${event.summary}`);
        continue;
      }

      const task = matchingTasks[0];

      // —— 事件在 Google 端被删除/取消 → 解绑
      if (event.status === 'cancelled') {
        await base44.asServiceRole.entities.Task.update(task.id, {
          google_calendar_event_id: null,
          gcal_sync_enabled: false,
        });
        unlinked++;
        console.log(`Unlinked cancelled event from task: ${task.title}`);
        continue;
      }

      // —— 事件被修改 → 回写约定（仅在真的有变化时写库，避免与出站同步形成回环）
      const updateData = {};
      const isAllDay = !!event.start && !event.start.dateTime;

      if (event.start) {
        const newStart = event.start.dateTime || event.start.date;
        if (newStart) {
          const startMs2 = new Date(newStart).getTime();
          if (!task.reminder_time || Math.abs(new Date(task.reminder_time).getTime() - startMs2) > 1000) {
            updateData.reminder_time = new Date(startMs2).toISOString();
          }
          if (isAllDay !== !!task.is_all_day) updateData.is_all_day = isAllDay;
        }
      }

      if (event.end) {
        const newEnd = event.end.dateTime || event.end.date;
        if (newEnd) {
          let endMs2 = new Date(newEnd).getTime();
          if (isAllDay) endMs2 -= 24 * 60 * 60 * 1000; // 全天事件排他 end 还原
          const endIso2 = new Date(endMs2).toISOString();
          if (!task.end_time || Math.abs(new Date(task.end_time).getTime() - endMs2) > 1000) {
            updateData.end_time = endIso2;
          }
        }
      }

      if (event.summary && event.summary !== task.title) {
        updateData.title = event.summary;
      }

      if (Object.keys(updateData).length > 0) {
        // 时间在 Google 端被改动后，重置提醒标记，确保新时间到点会重新提醒
        if (updateData.reminder_time) {
          updateData.reminder_sent = false;
          updateData.advance_alert_sent = false;
        }
        await base44.asServiceRole.entities.Task.update(task.id, updateData);
        updated++;
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
      updated,
      imported,
      unlinked,
      syncTokenSaved: !!newSyncToken
    });
  } catch (error) {
    console.error('Calendar webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});