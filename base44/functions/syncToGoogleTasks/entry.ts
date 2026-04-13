import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googletasks");

    // Get or create a "SoulSentry" task list
    const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const listsData = await listsRes.json();
    
    let targetList = (listsData.items || []).find(l => l.title === 'SoulSentry');
    
    if (!targetList) {
      const createListRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: 'SoulSentry' })
      });
      targetList = await createListRes.json();
    }

    const listId = targetList.id;

    // Get today's tasks from the app
    const allTasks = await base44.entities.Task.filter({});
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const todayTasks = allTasks.filter(t => {
      if (t.deleted_at) return false;
      if (!t.reminder_time) return false;
      const rt = new Date(t.reminder_time);
      const start = new Date(todayStart);
      const end = new Date(todayEnd);
      // Check if task's date range overlaps with today
      const taskEnd = t.end_time ? new Date(t.end_time) : rt;
      return rt <= end && taskEnd >= start;
    });

    if (todayTasks.length === 0) {
      return Response.json({ synced: 0, message: '今天没有需要同步的约定' });
    }

    // Get existing tasks in the Google Tasks list to avoid duplicates
    const existingRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?showCompleted=true&maxResults=100`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const existingData = await existingRes.json();
    const existingTasks = existingData.items || [];

    const categoryLabels = {
      work: '工作', personal: '个人', health: '健康',
      study: '学习', family: '家庭', shopping: '购物',
      finance: '财务', other: '其他'
    };

    const priorityLabels = {
      low: '低', medium: '中', high: '高', urgent: '紧急'
    };

    let synced = 0;
    let updated = 0;

    for (const task of todayTasks) {
      const title = `[${categoryLabels[task.category] || '其他'}] ${task.title}`;
      const notes = [
        task.description || '',
        `优先级: ${priorityLabels[task.priority] || '中'}`,
        task.reminder_time ? `时间: ${new Date(task.reminder_time).toLocaleString('zh-CN')}` : ''
      ].filter(Boolean).join('\n');

      const dueDate = task.reminder_time ? new Date(task.reminder_time).toISOString().split('T')[0] + 'T00:00:00.000Z' : undefined;
      const status = task.status === 'completed' ? 'completed' : 'needsAction';

      // Check if this task was already synced (by matching a tag in notes)
      const syncTag = `[soul-id:${task.id}]`;
      const existing = existingTasks.find(et => et.notes && et.notes.includes(syncTag));

      const body = {
        title,
        notes: notes + '\n' + syncTag,
        due: dueDate,
        status
      };

      if (existing) {
        // Update existing
        await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${existing.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        updated++;
      } else {
        // Create new
        await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        synced++;
      }
    }

    return Response.json({ 
      synced, 
      updated,
      total: todayTasks.length,
      listName: 'SoulSentry',
      message: `已同步 ${synced} 个新约定，更新 ${updated} 个已有约定到 Google Tasks`
    });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});