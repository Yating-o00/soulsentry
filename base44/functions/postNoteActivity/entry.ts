import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// 公开端点：未注册访客在心签分享页留言（不可修改原内容）
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = (body.token || '').trim();
    const activityType = (body.activity_type || '').trim();
    if (!token || activityType !== 'comment') {
      return Response.json({ error: '参数不合法' }, { status: 400 });
    }

    const invites = await base44.asServiceRole.entities.CollaborationInvite.filter({ token });
    const invite = invites && invites[0];
    if (!invite || invite.resource_type !== 'note' || !invite.note_id) {
      return Response.json({ error: '邀请链接无效' }, { status: 404 });
    }
    if (invite.status === 'revoked') return Response.json({ error: '邀请链接已失效' }, { status: 410 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json({ error: '邀请链接已过期' }, { status: 410 });
    }

    const note = await base44.asServiceRole.entities.Note.get(invite.note_id).catch(() => null);
    if (!note || note.deleted_at) return Response.json({ error: '这条心签已不存在' }, { status: 404 });

    let actorId = '';
    let actorName = (body.actor_name || '').trim();
    try {
      const me = await base44.auth.me();
      if (me) {
        actorId = me.id;
        if (!actorName) actorName = me.full_name || '伙伴';
      }
    } catch (_e) {
      actorId = '';
    }
    if (!actorName) actorName = '匿名伙伴';

    const text = (body.content || '').trim();

    if (!text) return Response.json({ error: '留言内容不能为空' }, { status: 400 });

    const activity = await base44.asServiceRole.entities.CollaborationActivity.create({
      resource_type: 'note',
      note_id: note.id,
      invite_token: token,
      owner_id: invite.inviter_id || '',
      actor_name: actorName,
      actor_id: actorId,
      guest_key: body.guest_key || '',
      activity_type: 'comment',
      content: text,
      seen_by_owner: false
    });

    if (invite.inviter_id) {
      const label = `留言：${text.slice(0, 60)}`;
      await base44.asServiceRole.entities.Notification.create({
        recipient_id: invite.inviter_id,
        type: 'comment',
        title: `💬 ${actorName} 参与了你分享的心签`,
        content: label,
        link: `/Notes?noteId=${note.id}`,
        related_entity_id: note.id,
        sender_id: actorId
      }).catch(() => null);
    }

    return Response.json({ success: true, activity_id: activity.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});