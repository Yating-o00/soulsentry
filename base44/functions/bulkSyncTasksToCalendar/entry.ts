import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 一次性把当前用户所有有时间的约定推送到 Google Calendar
// 同时把 gcal_sync_enabled 置为 true，这样后续任何修改都会被
// "autoSyncTaskToCalendar" 实体自动化自动同步，保证时间轴持续一致。
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const authHeader = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // 支持分批处理：避免一次性同步太多任务超时（502）
    // 前端可以多次调用，每次处理一批
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batch_size || 15, 25);
    const concurrency = 3; // 每组并发数，避免触发 Google Calendar Rate Limit
    const cursor = body.cursor || 0;
    const onlyUnsynced = body.only_unsynced !== false; // 默认只同步还没绑定日历事件的任务

    // 仅同步当前用户自己的、未删除的、且有 reminder_time 的任务
    const allTasks = await base44.entities.Task.filter({ created_by: user.email });
    const eligible = allTasks.filter(t =>
      !t.deleted_at && t.reminder_time &&
      (!onlyUnsynced || !t.google_calendar_event_id)
    );
    const tasks = eligible.slice(cursor, cursor + batchSize);

    const categoryLabels = {
      work: '📝 工作', personal: '⚡ 生活', health: '🌱 健康',
      study: '📖 学习', family: '👨‍👩‍👧 家庭', shopping: '🛒 购物',
      finance: '💰 财务', other: '⚡ 其他'
    };
    const priorityLabels = { low: '低', medium: '中', high: '高', urgent: '紧急' };

    let created = 0, updated = 0, failed = 0, skipped = 0;
    const errors = [];

    // 分组并发处理（限速避免 Google Calendar 429）
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const processOne = async (task) => {
      try {
        const startTime = new Date(task.reminder_time);
        const endTime = task.end_time ? new Date(task.end_time) : new Date(startTime.getTime() + 3600000);

        const descParts = [];
        if (task.description) descParts.push(task.description);
        descParts.push(`\n--- SoulSentry ---`);
        descParts.push(`分类: ${categoryLabels[task.category] || task.category || '其他'}`);
        descParts.push(`优先级: ${priorityLabels[task.priority] || task.priority || '中'}`);
        if (task.tags?.length) descParts.push(`标签: ${task.tags.join(', ')}`);
        if (task.status) descParts.push(`状态: ${task.status}`);

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
          colorId: task.priority === 'urgent' ? '11'
                 : task.priority === 'high' ? '6'
                 : task.category === 'work' ? '9' : '2',
        };

        let calendarEvent;

        if (task.google_calendar_event_id) {
          const updateRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.google_calendar_event_id}`,
            { method: 'PUT', headers: authHeader, body: JSON.stringify(event) }
          );
          if (updateRes.ok) {
            calendarEvent = await updateRes.json();
            updated++;
          } else if (updateRes.status === 404 || updateRes.status === 410) {
            // 事件被外部删了 → 重新创建
            calendarEvent = null;
          } else {
            const errText = await updateRes.text();
            throw new Error(`update failed: ${errText}`);
          }
        }

        if (!calendarEvent) {
          const createRes = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            { method: 'POST', headers: authHeader, body: JSON.stringify(event) }
          );
          if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`create failed: ${errText}`);
          }
          calendarEvent = await createRes.json();
          created++;
        }

        await base44.asServiceRole.entities.Task.update(task.id, {
          gcal_sync_enabled: true,
          google_calendar_event_id: calendarEvent.id,
        });
      } catch (err) {
        failed++;
        errors.push({ task_id: task.id, title: task.title, error: err.message });
      }
    };

    for (let i = 0; i < tasks.length; i += concurrency) {
      const chunk = tasks.slice(i, i + concurrency);
      await Promise.all(chunk.map(processOne));
      if (i + concurrency < tasks.length) await sleep(250);
    }

    skipped = allTasks.length - eligible.length;
    const nextCursor = cursor + tasks.length;
    const done = nextCursor >= eligible.length;

    return Response.json({
      success: true,
      total: allTasks.length,
      eligible: eligible.length,
      processed_in_batch: tasks.length,
      cursor: nextCursor,
      done,
      synced: created + updated,
      created,
      updated,
      skipped_no_time: skipped,
      failed,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error('Bulk sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});