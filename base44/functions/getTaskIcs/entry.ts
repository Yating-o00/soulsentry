import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// 公开端点：通过协作邀请 token 下载约定的 .ics 日历提醒文件
// 供未注册的被分享者把约定加入自己手机的系统日历（直接 URL 打开，绕过移动端 blob 下载限制）
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let token = '';
    try {
      token = (new URL(req.url).searchParams.get('token') || '').trim();
    } catch (_e) { token = ''; }
    if (!token) {
      const body = await req.json().catch(() => ({}));
      token = (body && body.token ? String(body.token) : '').trim();
    }
    if (!token) return Response.json({ error: '缺少邀请 token' }, { status: 400 });

    const invites = await base44.asServiceRole.entities.CollaborationInvite.filter({ token });
    const invite = invites && invites[0];
    if (!invite) return Response.json({ error: '邀请链接无效' }, { status: 404 });
    if (invite.status === 'revoked') return Response.json({ error: '邀请链接已失效' }, { status: 410 });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json({ error: '邀请链接已过期' }, { status: 410 });
    }
    if (!invite.task_id) return Response.json({ error: '该邀请没有关联约定' }, { status: 400 });

    const task = await base44.asServiceRole.entities.Task.get(invite.task_id).catch(() => null);
    if (!task) return Response.json({ error: '这个约定已不存在' }, { status: 404 });

    const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);

    const start = task.reminder_time ? new Date(task.reminder_time) : new Date(Date.now() + 3600000);
    let end = task.end_time ? new Date(task.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
    if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SoulSentry//Collaboration//CN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${task.id}@soulsentry`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${esc(task.title || '共同约定')}`,
      `DESCRIPTION:${esc(task.description || '来自心栈的共同约定')}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:约定提醒',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="reminder.ics"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});