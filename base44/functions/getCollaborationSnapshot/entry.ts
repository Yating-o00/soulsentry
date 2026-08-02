import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = (body && body.token ? String(body.token) : '').trim();
    if (!token) return Response.json({ error: '缺少邀请 token' }, { status: 400 });

    const invites = await base44.asServiceRole.entities.CollaborationInvite.filter({ token });
    const invite = invites && invites[0];
    if (!invite) return Response.json({ error: '邀请链接无效' }, { status: 404 });
    if (invite.status === 'revoked') return Response.json({ error: '邀请链接已失效' }, { status: 410 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json({ error: '邀请链接已过期' }, { status: 410 });
    }

    const task = await base44.asServiceRole.entities.Task.get(invite.task_id).catch(() => null);
    if (!task) return Response.json({ error: '这个约定已不存在' }, { status: 404 });

    const subtasks = await base44.asServiceRole.entities.Task
      .filter({ parent_task_id: task.id })
      .catch(() => []);

    await base44.asServiceRole.entities.CollaborationInvite.update(invite.id, {
      view_count: (invite.view_count || 0) + 1
    }).catch(() => null);

    const activities = await base44.asServiceRole.entities.CollaborationActivity
      .filter({ task_id: task.id }, '-created_date', 30)
      .catch(() => []);

    let viewer = null;
    try {
      const me = await base44.auth.me();
      if (me) {
        viewer = {
          id: me.id,
          full_name: me.full_name,
          already_joined: (task.assigned_to || []).indexOf(me.id) !== -1
        };
      }
    } catch (_e) {
      viewer = null;
    }

    return Response.json({
      invite: {
        token: invite.token,
        message: invite.message || '',
        permission: invite.permission || 'collaborate',
        inviter_name: invite.inviter_name || '一位伙伴',
        accepted_count: (invite.accepted_by_ids || []).length
      },
      task: {
        id: task.id,
        title: task.title,
        description: task.description || '',
        category: task.category,
        priority: task.priority,
        status: task.status,
        progress: task.progress || 0,
        reminder_time: task.reminder_time || null,
        collaborator_count: (task.assigned_to || []).length
      },
      subtasks: (subtasks || []).map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status
      })),
      activities: (activities || []).map((a) => ({
        id: a.id,
        actor_name: a.actor_name,
        activity_type: a.activity_type,
        content: a.content,
        subtask_title: a.subtask_title,
        created_date: a.created_date
      })),
      viewer
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});