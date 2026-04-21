// 在任务提醒时刻被一次性定时自动化触发，负责三通道推送：
// 1) 创建 Notification 实体（前端订阅即可弹窗）
// 2) 发送邮件（通过 Gmail 连接器）
// 3) 确保 Google Calendar 事件存在（日历通知由 Google 端触发）
//
// 入参 (function_args)：
//   { taskId, userEmail, isAdvance?: boolean, advanceMinutes?: number }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { taskId, userEmail, isAdvance = false, advanceMinutes = 0 } = body || {};

    if (!taskId) {
      return Response.json({ error: 'taskId is required' }, { status: 400 });
    }

    // 使用 service role 读取任务（自动化上下文中没有终端用户会话）
    const task = await base44.asServiceRole.entities.Task.get(taskId);
    if (!task) {
      return Response.json({ ok: true, skipped: 'task_not_found' });
    }

    // 已完成/已取消/已软删 的任务不再推送
    if (['completed', 'cancelled'].includes(task.status) || task.deleted_at) {
      return Response.json({ ok: true, skipped: 'task_finalized' });
    }

    const recipient = userEmail || task.created_by;
    const channels = task.notification_channels && task.notification_channels.length > 0
      ? task.notification_channels
      : ['in_app', 'browser'];

    const titlePrefix = isAdvance ? `📋 即将到来（${advanceMinutes}分钟后）` : '⏰ 提醒';
    const notifTitle = `${titlePrefix}：${task.title}`;
    const notifContent = task.description || '现在是完成这个约定的时间';

    const results = { in_app: false, email: false, calendar: false };

    // 1) 应用内通知：创建 Notification 实体
    if (channels.includes('in_app') || channels.includes('browser')) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          recipient_id: recipient,
          type: 'reminder',
          title: notifTitle,
          content: notifContent,
          link: `/Tasks?taskId=${task.id}`,
          related_entity_id: task.id,
          is_read: false,
        });
        results.in_app = true;
      } catch (e) {
        console.error('create Notification failed:', e.message);
      }
    }

    // 2) 邮件推送（仅当用户开启邮件渠道或 email_reminder.enabled）
    const emailEnabled = channels.includes('email') || task.email_reminder?.enabled;
    if (emailEnabled && recipient) {
      try {
        const emailTo = task.email_reminder?.recipient_email || recipient;
        await base44.asServiceRole.functions.invoke('sendTaskEmailReminder', {
          task,
          recipient_email: emailTo,
        });
        results.email = true;
      } catch (e) {
        console.error('sendTaskEmailReminder failed:', e.message);
      }
    }

    // 3) 日历同步（确保事件已在 Google Calendar 中，触发 Google 端的原生通知）
    if (task.gcal_sync_enabled && !isAdvance) {
      try {
        await base44.asServiceRole.functions.invoke('syncTaskToGoogleCalendar', {
          task_id: task.id,
        });
        results.calendar = true;
      } catch (e) {
        console.error('syncTaskToGoogleCalendar failed:', e.message);
      }
    }

    // 记录已发送（仅对主提醒）
    if (!isAdvance) {
      try {
        await base44.asServiceRole.entities.Task.update(task.id, { reminder_sent: true });
      } catch (_) {}
    }

    return Response.json({ ok: true, taskId, results });
  } catch (error) {
    console.error('sendActualNotification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});