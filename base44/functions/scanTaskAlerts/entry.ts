import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Build a compact WeCom markdown notice for an upcoming task
function buildWeworkMarkdown(task, hoursLeft) {
  const priorityMap = { urgent: '🔴 紧急', high: '🟠 高', medium: '🟡 中', low: '🟢 低' };
  const dueStr = new Date(task.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines = [
    `## ⚡ 任务即将截止`,
    `**${task.title}**`,
    `> ⏱ 还剩约 <font color="warning">${hoursLeft} 小时</font>`,
    `> 📅 截止：${dueStr}`,
    `> 🎯 优先级：${priorityMap[task.priority] || '中'}`,
    `> 📈 进度：${task.progress || 0}%`,
  ];
  if (task.description) {
    lines.push(`> 📝 ${String(task.description).slice(0, 150)}`);
  }
  lines.push(``);
  lines.push(`<font color="comment">— 灵魂哨兵 自动预警</font>`);
  return lines.join('\n');
}

async function sendWework(url, markdown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'markdown', markdown: { content: markdown } }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.errcode !== 0) throw new Error(data.errmsg || 'wework error');
}

async function sendEmail(base44, email, task, hoursLeft) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
  const dueStr = new Date(task.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#f97316,#ef4444);padding:20px;border-radius:10px 10px 0 0;color:white;">
    <h2 style="margin:0;">⚡ 任务即将截止</h2>
    <p style="margin:4px 0 0;opacity:.9;">还剩约 ${hoursLeft} 小时</p>
  </div>
  <div style="background:white;padding:22px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
    <h3 style="margin:0 0 10px;color:#0f172a;">${task.title}</h3>
    <p style="color:#475569;margin:6px 0;">截止时间：${dueStr}</p>
    <p style="color:#475569;margin:6px 0;">当前进度：${task.progress || 0}%</p>
  </div>
</div>`;
  const subject = `⚡ 即将截止：${task.title}`;
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const raw = [
    `To: ${email}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // This function is triggered by a scheduled automation (admin) - verify admin role
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const now = Date.now();
    // Scan tasks whose deadline is within the next 24 hours and not yet alerted / completed
    const inWindow = new Date(now + 24 * 3600 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    const tasks = await base44.asServiceRole.entities.Task.filter({
      status: 'pending',
      reminder_sent: false,
    });

    let processed = 0;
    const errors = [];

    for (const task of tasks) {
      if (!task.reminder_time) continue;
      if (task.reminder_time > inWindow) continue;
      if (task.reminder_time < nowIso) continue; // already overdue - skip (manual only)
      if (task.deleted_at) continue;

      // Load creator's settings
      const creators = await base44.asServiceRole.entities.User.filter({ email: task.created_by });
      const creator = creators?.[0];
      if (!creator) continue;

      const settings = creator.task_alert_settings || {};
      if (!settings.auto_alert_enabled) continue;

      const hoursBefore = settings.alert_hours_before ?? 2;
      const triggerAt = new Date(task.reminder_time).getTime() - hoursBefore * 3600 * 1000;
      if (now < triggerAt) continue; // not yet within alert window

      const hoursLeft = Math.max(1, Math.round((new Date(task.reminder_time).getTime() - now) / 3600000));
      const channels = settings.alert_channels?.length ? settings.alert_channels : ['wework'];

      let anyOk = false;
      for (const ch of channels) {
        try {
          if (ch === 'wework' && creator.wework_webhook_url) {
            await sendWework(creator.wework_webhook_url, buildWeworkMarkdown(task, hoursLeft));
            anyOk = true;
          } else if (ch === 'email' && creator.email) {
            await sendEmail(base44, creator.email, task, hoursLeft);
            anyOk = true;
          }
        } catch (e) {
          errors.push({ task_id: task.id, channel: ch, error: e.message });
        }
      }

      if (anyOk) {
        await base44.asServiceRole.entities.Task.update(task.id, { reminder_sent: true });
        processed++;
      }
    }

    return Response.json({ success: true, processed, scanned: tasks.length, errors });
  } catch (error) {
    console.error('scanTaskAlerts error:', error);
    return Response.json({ error: error.message || 'Failed' }, { status: 500 });
  }
});