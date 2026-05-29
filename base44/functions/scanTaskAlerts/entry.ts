import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import webpush from 'npm:web-push@3.6.7';

// 给目标用户发一条 Web Push 系统通知（App 关闭也能收到）
async function sendWebPushTo(base44, targetEmail, task, opts) {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@soulsentry.app';
  if (!publicKey || !privateKey) throw new Error('VAPID keys not configured');
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const prefs = await base44.asServiceRole.entities.UserPreference.filter(
    { created_by: targetEmail }, '-updated_date', 1
  );
  const pref = prefs?.[0];
  const sub = pref?.push_subscription;
  if (!pref?.push_enabled || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error('No active push subscription');
  }

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    url: `/Tasks?id=${task.id}`,
    tag: `${opts.kind}-${task.id}`,
    requireInteraction: opts.urgent,
    vibrate: [200, 100, 200],
    data: { task_id: task.id, type: opts.kind },
  });

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      payload,
      { TTL: 60 * 60 * 4, urgency: opts.urgent ? 'high' : 'normal' }
    );
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await base44.asServiceRole.entities.UserPreference.update(pref.id, {
        push_enabled: false, push_subscription: null,
      });
    }
    throw err;
  }
}

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
  if (task.description) lines.push(`> 📝 ${String(task.description).slice(0, 150)}`);
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

// 收集任务的所有接收者：创建者 + 被分配者
async function collectRecipients(base44, task) {
  const emails = new Set();
  if (task.created_by) emails.add(task.created_by);

  // assigned_to 可能存的是 user.id 或 email
  if (Array.isArray(task.assigned_to) && task.assigned_to.length > 0) {
    for (const idOrEmail of task.assigned_to) {
      if (!idOrEmail) continue;
      if (typeof idOrEmail === 'string' && idOrEmail.includes('@')) {
        emails.add(idOrEmail);
        continue;
      }
      try {
        const users = await base44.asServiceRole.entities.User.filter({ id: idOrEmail });
        if (users?.[0]?.email) emails.add(users[0].email);
      } catch {}
    }
  }
  return Array.from(emails);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const now = Date.now();
    const inWindow = new Date(now + 24 * 3600 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    const tasks = await base44.asServiceRole.entities.Task.filter({
      status: 'pending',
      reminder_sent: false,
    });

    let processedDue = 0;
    let processedAdvance = 0;
    const errors = [];

    for (const task of tasks) {
      if (!task.reminder_time) continue;
      if (task.deleted_at) continue;

      const reminderMs = new Date(task.reminder_time).getTime();
      if (Number.isNaN(reminderMs)) continue;

      // —— 情况 A：到点提醒（任务的 reminder_time 现在 ≤ 当前时间，且未超过 10 分钟前）
      // 5 分钟扫描一次，10 分钟窗口足够覆盖一次延迟，且避免几小时前的任务被反复补推
      // 超过窗口仍未发出的任务由"24h+ 高优先级主动 nag"逻辑兜底，不在这里堆积
      const isDueNow = reminderMs <= now && now - reminderMs <= 10 * 60 * 1000;

      // —— 情况 B：截止预警（在未来 24 小时窗口内，按用户设置的提前小时数预警）
      const isInAdvanceWindow = task.reminder_time > nowIso && task.reminder_time <= inWindow;

      if (!isDueNow && !isInAdvanceWindow) continue;

      // 收集所有接收者：创建者 + assigned_to
      const recipients = await collectRecipients(base44, task);
      if (recipients.length === 0) continue;

      let anyOk = false;

      for (const email of recipients) {
        const users = await base44.asServiceRole.entities.User.filter({ email });
        const u = users?.[0];
        if (!u) continue;

        const settings = u.task_alert_settings || {};
        // 默认开启 web_push，让用户开了"后台推送"就能直接收到
        const channels = settings.alert_channels?.length
          ? settings.alert_channels
          : ['web_push'];

        // 到点提醒：直接推
        if (isDueNow) {
          for (const ch of channels) {
            try {
              if (ch === 'web_push') {
                await sendWebPushTo(base44, email, task, {
                  title: `🔔 ${task.title}`,
                  body: task.description
                    ? String(task.description).slice(0, 120)
                    : '提醒时间到了',
                  kind: 'task_due',
                  urgent: task.priority === 'urgent' || task.priority === 'high',
                });
                anyOk = true;
              } else if (ch === 'wework' && u.wework_webhook_url) {
                const md = `## 🔔 任务提醒\n**${task.title}**\n> ${new Date(reminderMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
                await sendWework(u.wework_webhook_url, md);
                anyOk = true;
              }
            } catch (e) {
              errors.push({ task_id: task.id, email, channel: ch, error: e.message });
            }
          }
          if (anyOk) processedDue++;
          continue;
        }

        // 截止预警：只有用户显式开启了 auto_alert_enabled 才推（保留原逻辑）
        if (isInAdvanceWindow && settings.auto_alert_enabled) {
          const hoursBefore = settings.alert_hours_before ?? 2;
          const triggerAt = reminderMs - hoursBefore * 3600 * 1000;
          if (now < triggerAt) continue;

          const hoursLeft = Math.max(1, Math.round((reminderMs - now) / 3600000));
          for (const ch of channels) {
            try {
              if (ch === 'wework' && u.wework_webhook_url) {
                await sendWework(u.wework_webhook_url, buildWeworkMarkdown(task, hoursLeft));
                anyOk = true;
              } else if (ch === 'web_push') {
                await sendWebPushTo(base44, email, task, {
                  title: `⚡ 即将截止：${task.title}`,
                  body: `还剩约 ${hoursLeft} 小时 · 优先级 ${task.priority || 'medium'}`,
                  kind: 'task_alert',
                  urgent: hoursLeft <= 2,
                });
                anyOk = true;
              }
            } catch (e) {
              errors.push({ task_id: task.id, email, channel: ch, error: e.message });
            }
          }
          if (anyOk) processedAdvance++;
        }
      }

      if (anyOk) {
        await base44.asServiceRole.entities.Task.update(task.id, { reminder_sent: true });
      }
    }

    return Response.json({
      success: true,
      scanned: tasks.length,
      due_now_sent: processedDue,
      advance_sent: processedAdvance,
      errors,
    });
  } catch (error) {
    console.error('scanTaskAlerts error:', error);
    return Response.json({ error: error.message || 'Failed' }, { status: 500 });
  }
});