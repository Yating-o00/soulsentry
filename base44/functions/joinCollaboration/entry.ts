import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const token = (body && body.token ? String(body.token) : '').trim();
    if (!token) return Response.json({ error: '缺少邀请 token' }, { status: 400 });

    const invites = await base44.asServiceRole.entities.CollaborationInvite.filter({ token });
    const invite = invites && invites[0];
    if (!invite || invite.status === 'revoked') {
      return Response.json({ error: '邀请链接已失效' }, { status: 410 });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json({ error: '邀请链接已过期' }, { status: 410 });
    }
    if ((invite.permission || 'collaborate') !== 'collaborate') {
      return Response.json({ error: '这个链接仅供查看' }, { status: 403 });
    }

    const task = await base44.asServiceRole.entities.Task.get(invite.task_id).catch(() => null);
    if (!task) return Response.json({ error: '这个约定已不存在' }, { status: 404 });

    const assigned = (task.assigned_to || []).slice();
    if (assigned.indexOf(user.id) === -1) assigned.push(user.id);

    await base44.asServiceRole.entities.Task.update(task.id, {
      assigned_to: assigned,
      is_shared: true,
      team_visibility: 'team'
    });

    const accepted = (invite.accepted_by_ids || []).slice();
    if (accepted.indexOf(user.id) === -1) {
      accepted.push(user.id);
      await base44.asServiceRole.entities.CollaborationInvite.update(invite.id, {
        accepted_by_ids: accepted
      });

      if (invite.inviter_id) {
        await base44.asServiceRole.entities.Notification.create({
          recipient_id: invite.inviter_id,
          type: 'assignment',
          title: '🤝 有人加入了你的共同约定',
          content: `${user.full_name || '一位伙伴'} 加入了「${task.title}」，你们的进度将实时同步。`,
          link: `/Tasks?taskId=${task.id}`,
          related_entity_id: task.id,
          sender_id: user.id
        }).catch(() => null);
      }
    }

    return Response.json({
      success: true,
      task_id: task.id,
      task_title: task.title,
      inviter_name: invite.inviter_name || '伙伴'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});