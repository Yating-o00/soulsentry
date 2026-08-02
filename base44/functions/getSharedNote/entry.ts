import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// 公开端点：通过分享 token 打开心签协作快照（无需注册）
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = (body.token || '').trim();
    if (!token) return Response.json({ error: '缺少邀请 token' }, { status: 400 });

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

    await base44.asServiceRole.entities.CollaborationInvite.update(invite.id, {
      view_count: (invite.view_count || 0) + 1
    }).catch(() => null);

    const activities = await base44.asServiceRole.entities.CollaborationActivity
      .filter({ note_id: note.id }, '-created_date', 30)
      .catch(() => []);

    return Response.json({
      invite: {
        token: invite.token,
        message: invite.message || '',
        permission: invite.permission || 'collaborate',
        inviter_name: invite.inviter_name || '一位伙伴'
      },
      note: {
        id: note.id,
        plain_text: note.plain_text || '',
        content: note.content || '',
        tags: note.tags || [],
        updated_date: note.updated_date
      },
      activities: (activities || []).map((a) => ({
        id: a.id,
        actor_name: a.actor_name,
        activity_type: a.activity_type,
        content: a.content,
        created_date: a.created_date
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});