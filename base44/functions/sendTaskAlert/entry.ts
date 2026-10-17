import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Build a Markdown message for Task alerts
function buildMarkdown(task, recipientName) {
  const priorityMap = { urgent: '🔴 紧急', high: '🟠 高', medium: '🟡 中', low: '🟢 低' };
  const statusMap = { pending: '待办', in_progress: '进行中', completed: '已完成', blocked: '阻塞', snoozed: '已推迟', cancelled: '已取消' };

  const lines = [
    `## ⏰ 任务提醒：${task.title}`,
    `> 你好 **${recipientName || '朋友'}**，这是来自灵魂哨兵的一条任务摘要。`,
    ``,
  ];

  if (task.reminder_time) {
    const dueDate = new Date(task.reminder_time);
    const now = new Date();
    const diffHours = Math.round((dueDate.getTime() - now.getTime()) / 3600000);
    let urgencyLabel = '';
    if (diffHours < 0) urgencyLabel = ` <font color="warning">（已逾期 ${Math.abs(diffHours)} 小时）</font>`;
    else if (diffHours <= 2) urgencyLabel = ` <font color="warning">（还剩 ${diffHours} 小时）</font>`;
    else if (diffHours <= 24) urgencyLabel = ` <font color="comment">（还剩 ${diffHours} 小时）</font>`;
    lines.push(`**⏱ 截止时间**：${dueDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}${urgencyLabel}`);
  }

  lines.push(`**🎯 优先级**：${priorityMap[task.priority] || task.priority || '中'}`);
  lines.push(`**📌 当前状态**：${statusMap[task.status] || task.status || '待办'}`);
  lines.push(`**📈 完成进度**：${task.progress || 0}%`);

  if (task.description) {
    lines.push(``);
    lines.push(`**📝 描述**：`);
    lines.push(`> ${String(task.description).slice(0, 300)}`);
  }

  if (task.ai_analysis?.risks?.length > 0) {
    lines.push(``);
    lines.push(`**⚠️ 风险提示**：`);
    task.ai_analysis.risks.slice(0, 3).forEach((r) => lines.push(`> • ${r}`));
  }

  lines.push(``);
  lines.push(`<font color="comment">— 由 灵魂哨兵 发送</font>`);
  return lines.join('\n');
}

// Send via WeCom (企业微信) group robot webhook
async function sendWeworkMessage(webhookUrl, markdown) {
  if (!webhookUrl || !/qyapi\.weixin\.qq\.com/.test(webhookUrl)) {
    throw new Error('企业微信 Webhook URL 无效');
  }
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { content: markdown },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.errcode !== 0) {
    throw new Error(`企业微信推送失败: ${data.errmsg || JSON.stringify(data)}`);
  }
  return data;
}

// Send via Gmail using the connector
async function sendEmailMessage(base44, recipientEmail, task) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

  const priorityMap = { urgent: '紧急', high: '高', medium: '中', low: '低' };
  const dueStr = task.reminder_time
    ? new Date(task.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : '未设置';

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#384877,#6366f1);padding:28px;border-radius:12px 12px 0 0;color:white;">
    <h1 style="margin:0;font-size:22px;">⏰ 任务提醒</h1>
    <p style="margin:6px 0 0;opacity:.9;font-size:14px;">灵魂哨兵为你同步进度</p>
  </div>
  <div style="background:#f8fafc;padding:24px;border-radius:0 0 12px 12px;">
    <div style="background:white;padding:22px;border-radius:10px;">
      <h2 style="margin:0 0 12px;color:#0f172a;">${task.title}</h2>
      ${task.description ? `<p style="color:#475569;line-height:1.6;white-space:pre-wrap;">${String(task.description).slice(0, 500)}</p>` : ''}
      <table style="width:100%;margin-top:16px;font-size:14px;">
        <tr><td style="padding:6px 0;color:#64748b;width:100px;">⏱ 截止时间</td><td style="color:#0f172a;">${dueStr}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">🎯 优先级</td><td style="color:#0f172a;">${priorityMap[task.priority] || '中'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">📈 进度</td><td style="color:#0f172a;">${task.progress || 0}%</td></tr>
      </table>
    </div>
  </div>
</div>`;

  const subject = `⏰ 任务提醒：${task.title}`;
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const rawMessage = [
    `To: ${recipientEmail}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');

  const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodedMessage }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`Gmail API 错误: ${JSON.stringify(errorData)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, channels } = await req.json();
    if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });
    const targetChannels = Array.isArray(channels) && channels.length > 0 ? channels : ['wework'];

    const tasks = await base44.entities.Task.filter({ id: task_id });
    const task = tasks?.[0];
    if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

    const results = {};
    const errors = {};

    if (targetChannels.includes('wework')) {
      try {
        if (!user.wework_webhook_url) {
          throw new Error('请先在账户设置中填写企业微信 Webhook URL');
        }
        const md = buildMarkdown(task, user.full_name);
        await sendWeworkMessage(user.wework_webhook_url, md);
        results.wework = 'ok';
      } catch (e) {
        errors.wework = e.message;
      }
    }

    if (targetChannels.includes('email')) {
      try {
        await sendEmailMessage(base44, user.email, task);
        results.email = 'ok';
      } catch (e) {
        errors.email = e.message;
      }
    }

    const ok = Object.keys(results).length > 0;
    return Response.json({ success: ok, results, errors }, { status: ok ? 200 : 500 });
  } catch (error) {
    console.error('sendTaskAlert error:', error);
    return Response.json({ error: error.message || 'Failed' }, { status: 500 });
  }
});