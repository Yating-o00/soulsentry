import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 把 Google Tasks 里未完成的待办并入心栈约定（按 gtask id 去重）
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googletasks');
    const h = { Authorization: `Bearer ${accessToken}` };
    const lists = (await (await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', { headers: h })).json()).items || [];

    const existing = await base44.entities.Task.filter({ created_by_id: user.id, tags: { $in: ['来自待办'] } });
    const seen = new Set(existing.flatMap((t) => (t.tags || []).filter((x) => x.startsWith('gtask:'))));

    const toCreate = [];
    for (const list of lists) {
      if (list.title === 'SoulSentry') continue; // 心栈推出去的，不再回流
      const items = (await (await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false&maxResults=100`, { headers: h })).json()).items || [];
      for (const it of items) {
        if (!it.title || seen.has(`gtask:${it.id}`)) continue;
        // Google Tasks 的 due 只有日期，默认放在当天上午 9 点（北京时间）提醒
        const reminder = it.due ? new Date(it.due.slice(0, 10) + 'T01:00:00.000Z').toISOString() : undefined;
        toCreate.push({
          title: it.title,
          description: it.notes || `来自待办清单「${list.title}」`,
          reminder_time: reminder,
          advance_reminders: reminder ? [10] : [],
          notification_channels: ['in_app', 'browser'],
          tags: ['来自待办', `gtask:${it.id}`],
        });
      }
    }
    if (toCreate.length) await base44.entities.Task.bulkCreate(toCreate);
    return Response.json({ imported: toCreate.length, lists: lists.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});