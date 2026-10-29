import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { space_id, token } = await req.json().catch(() => ({}));
    if (!space_id || !token) return Response.json({ error: 'space_id and token required' }, { status: 400 });

    const sr = base44.asServiceRole.entities;
    const space = await sr.CollabSpace.get(space_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!space || space.invite_token !== token) return Response.json({ error: '邀请链接无效' }, { status: 404 });

    if (!(space.member_ids || []).includes(user.id)) {
      await sr.CollabSpace.update(space.id, {
        member_ids: [...(space.member_ids || []), user.id],
        members: [...(space.members || []), { id: user.id, name: user.full_name || user.email, role: 'member' }],
      });
      for (const Ent of [sr.CollabMessage, sr.CollabItem]) {
        let more = true;
        while (more) {
          const r = await Ent.updateMany(
            { space_id: space.id, member_ids: { $nin: [user.id] } },
            { $addToSet: { member_ids: user.id } }
          );
          more = !!r?.has_more;
        }
      }
      await sr.CollabMessage.create({
        space_id: space.id, is_agent: true, author_name: 'Agent',
        content: `${user.full_name || '新成员'} 加入了协同约定`,
        member_ids: [...(space.member_ids || []), user.id],
      });
    }
    return Response.json({ ok: true, space_id: space.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});