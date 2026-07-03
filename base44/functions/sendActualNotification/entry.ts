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
    let channels = task.notification_channels && task.notification_channels.length > 0
      ? task.notification_channels
      : ['in_app', 'browser'];

    // 通知规则匹配：按任务分类/优先级找到用户启用的规则，决定渠道与静音
    let matchedRule = null;
    try {
      const userRules = await base44.asServiceRole.entities.NotificationRule.filter({
        created_by: task.created_by,
        is_enabled: true,
      });
      matchedRule = (userRules || []).find(r =>
        (r.condition_category === 'all' || r.condition_category === task.category) &&
        (r.condition_priority === 'all' || r.condition_priority === task.priority)
      ) || null;
    } catch (e) {
      console.warn('load NotificationRule failed:', e.message);
    }

    // 规则指定了渠道 → 与任务自身渠道取并集（宁多勿漏，保证不错过）
    if (matchedRule?.action_channels?.length > 0) {
      channels = [...new Set([...channels, ...matchedRule.action_channels])];
    }
    // 静音规则：只抑制推送/邮件等打扰型渠道，应用内记录仍然保留（保底不丢）
    const muted = !!matchedRule?.action_mute;

    const titlePrefix = isAdvance ? `📋 即将到来（${advanceMinutes}分钟后）` : '⏰ 提醒';
    const notifTitle = `${titlePrefix}：${task.title}`;
    const notifContent = task.description || '现在是完成这个约定的时间';

    const results = { in_app: false, email: false, calendar: false, wechat: false };

    // 读取任务创建者，用于企业微信 webhook 与默认渠道
    let creator = null;
    try {
      const creators = await base44.asServiceRole.entities.User.filter({ email: task.created_by });
      creator = creators?.[0] || null;
    } catch (_) {}

    // 1) 应用内通知（保底渠道）：无论规则/渠道如何配置，始终创建 Notification 实体，
    //    保证手机端（应用内）的通知记录 100% 完整，用户不会错过任何通知
    {
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

    // 1.5) 浏览器后台推送（Web Push）—— 关闭网页也能弹通知的关键
    if (!muted && channels.includes('browser') && recipient) {
      try {
        const isUrgent = task.priority === 'urgent' || task.interruption_level === 'critical';
        const pushRes = await base44.asServiceRole.functions.invoke('sendWebPush', {
          user_email: recipient,
          title: notifTitle,
          body: notifContent.length > 140 ? notifContent.slice(0, 137) + '...' : notifContent,
          url: `/Tasks?taskId=${task.id}`,
          tag: `task-${task.id}-${isAdvance ? 'pre' : 'due'}`,
          requireInteraction: isUrgent,
          data: {
            task_id: task.id,
            is_advance: isAdvance,
            advance_minutes: advanceMinutes,
          },
        });
        if (!pushRes?.data?.error) {
          results.browser = true;
        } else {
          console.warn('sendWebPush returned error:', pushRes.data.error);
        }
      } catch (e) {
        console.error('sendWebPush failed:', e.message);
      }
    }

    // 2) 邮件推送（仅当用户开启邮件渠道或 email_reminder.enabled）
    const emailEnabled = channels.includes('email') || task.email_reminder?.enabled;
    if (!muted && emailEnabled && recipient) {
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

    // 2.5) 企业微信推送（任务勾选 wechat 渠道，或用户在 task_alert_settings 中默认启用 wework）
    const userAlertChannels = creator?.task_alert_settings?.alert_channels || [];
    const wechatEnabled =
      channels.includes('wechat') ||
      channels.includes('wework') ||
      userAlertChannels.includes('wework');
    if (!muted && wechatEnabled && creator?.wework_webhook_url) {
      try {
        const priorityMap = { urgent: '🔴 紧急', high: '🟠 高', medium: '🟡 中', low: '🟢 低' };
        const dueStr = task.reminder_time
          ? new Date(task.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          : '未设置';
        const md = [
          `## ${isAdvance ? '📋 即将到来' : '⏰ 任务提醒'}：${task.title}`,
          isAdvance ? `> 距离开始还有 <font color="warning">${advanceMinutes} 分钟</font>` : `> 现在是完成这个约定的时间`,
          ``,
          `**⏱ 时间**：${dueStr}`,
          `**🎯 优先级**：${priorityMap[task.priority] || '中'}`,
          `**📈 进度**：${task.progress || 0}%`,
          task.description ? `\n> 📝 ${String(task.description).slice(0, 200)}` : '',
          ``,
          `<font color="comment">— 由 灵魂哨兵 发送</font>`,
        ].filter(Boolean).join('\n');

        const wxRes = await fetch(creator.wework_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msgtype: 'markdown', markdown: { content: md } }),
        });
        const wxData = await wxRes.json().catch(() => ({}));
        if (wxData.errcode !== 0) {
          throw new Error(wxData.errmsg || JSON.stringify(wxData));
        }
        results.wechat = true;
      } catch (e) {
        console.error('wework push failed:', e.message);
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