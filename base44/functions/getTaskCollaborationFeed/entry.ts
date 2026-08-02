import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// 分享者视角：查看自己约定下所有被分享者的参与动态
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const taskId = (body.task_id || '').trim();

    const query = taskId ? { task_id: taskId } : { owner_id: user.id };
    const activities = await base44.asServiceRole.entities.CollaborationActivity
      .filter(query, '-created_date', 100)
      .catch(() => []);

    const visible = (activities || []).filter((a) => !taskId || a.owner_id === user.id || a.actor_id === user.id);

    if (body.mark_seen && visible.length > 0) {
      for (const a of visible) {
        if (!a.seen_by_owner && a.owner_id === user.id) {
          await base44.asServiceRole.entities.CollaborationActivity.update(a.id, { seen_by_owner: true }).catch(() => null);
        }
      }
    }

    return Response.json({
      activities: visible.map((a) => ({
        id: a.id,
        task_id: a.task_id,
        actor_name: a.actor_name,
        actor_id: a.actor_id || '',
        guest_key: a.guest_key || '',
        activity_type: a.activity_type,
        content: a.content,
        subtask_title: a.subtask_title,
        seen_by_owner: a.seen_by_owner,
        created_date: a.created_date
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});