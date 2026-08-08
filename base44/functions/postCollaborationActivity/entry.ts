import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// 公开端点：被分享者（含未注册访客）在分享页参与 —— 留言 / 勾选子约定 / 订阅提醒
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = (body.token || '').trim();
    const activityType = (body.activity_type || '').trim();
    const allowed = ['comment', 'subtask_check', 'subtask_uncheck', 'reminder_subscribe'];
    if (!token || allowed.indexOf(activityType) === -1) {
      return Response.json({ error: '参数不合法' }, { status: 400 });
    }

    const invites = await base44.asServiceRole.entities.CollaborationInvite.filter({ token });
    const invite = invites && invites[0];
    if (!invite || invite.status === 'revoked') {
      return Response.json({ error: '邀请链接已失效' }, { status: 410 });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json({ error: '邀请链接已过期' }, { status: 410 });
    }

    const task = await base44.asServiceRole.entities.Task.get(invite.task_id).catch(() => null);
    if (!task) return Response.json({ error: '这个约定已不存在' }, { status: 404 });

    let actorId = null;
    let actorName = (body.actor_name || '').trim();
    try {
      const me = await base44.auth.me();
      if (me) {
        actorId = me.id;
        if (!actorName) actorName = me.full_name || '伙伴';
      }
    } catch (_e) {
      actorId = null;
    }
    if (!actorName) actorName = '匿名伙伴';

    let subtaskTitle = '';
    if (activityType === 'subtask_check' || activityType === 'subtask_uncheck') {
      const subtask = await base44.asServiceRole.entities.Task.get(body.subtask_id).catch(() => null);
      let belongs = !!subtask && subtask.parent_task_id === task.id;
      if (!belongs && subtask && subtask.parent_task_id) {
        // 二级子约定：父级的父级是这个约定
        const parent = await base44.asServiceRole.entities.Task.get(subtask.parent_task_id).catch(() => null);
        belongs = !!parent && parent.parent_task_id === task.id;
      }
      if (!belongs) {
        return Response.json({ error: '子约定不存在' }, { status: 404 });
      }
      subtaskTitle = subtask.title;
      const done = activityType === 'subtask_check';
      await base44.asServiceRole.entities.Task.update(subtask.id, {
        status: done ? 'completed' : 'pending',
        completed_at: done ? new Date().toISOString() : null
      });
    }

    const activity = await base44.asServiceRole.entities.CollaborationActivity.create({
      task_id: task.id,
      invite_token: token,
      owner_id: invite.inviter_id || null,
      actor_name: actorName,
      actor_id: actorId,
      guest_key: body.guest_key || '',
      activity_type: activityType,
      content: (body.content || '').trim(),
      subtask_id: body.subtask_id || '',
      subtask_title: subtaskTitle,
      seen_by_owner: false
    });

    let notified = false;
    if (invite.inviter_id) {
      const label = activityType === 'comment'
        ? `留言：${(body.content || '').trim().slice(0, 60)}`
        : activityType === 'subtask_check'
          ? `勾选完成了「${subtaskTitle}」`
          : activityType === 'subtask_uncheck'
            ? `取消了「${subtaskTitle}」的完成`
            : '订阅了这个约定的时间提醒';
      try {
        await base44.asServiceRole.entities.Notification.create({
          recipient_id: invite.inviter_id,
          type: 'comment',
          title: `💬 ${actorName} 参与了你的共同约定`,
          content: `「${task.title}」— ${label}`,
          link: `/Teams?taskId=${task.id}`,
          related_entity_id: task.id,
          sender_id: actorId || ''
        });
        notified = true;
      } catch (_e) {
        notified = false;
      }
    }

    return Response.json({ success: true, activity_id: activity.id, notified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});