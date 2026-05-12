// AI 代理「发送邮件」核心动作
// 流程：解析指令 → 调用 Gmail 发送 → 在 Task 中记录 → 创建 Notification 告知用户
// 输入参数：
//   - to: 收件人邮箱（必填，如代理未提供则尝试从 content 中解析）
//   - subject: 主题（可选，AI 未给出则由内容自动生成）
//   - body: 正文（必填）
//   - instruction: 用户原始指令（可选，用于记录在 Task.description 中）
//
// 用法（在 task_assistant agent 中调用）：
//   base44.functions.invoke('agentSendEmail', { to, subject, body, instruction })

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function isEmail(s = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function deriveSubject(body = '', fallback = '来自 SoulSentry 的邮件') {
  const firstLine = (body || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  if (!firstLine) return fallback;
  return firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const to = (payload.to || '').trim();
    const body = (payload.body || '').trim();
    const subject = (payload.subject || '').trim() || deriveSubject(body);
    const instruction = (payload.instruction || '').trim();

    if (!isEmail(to)) {
      return Response.json({ error: '收件人邮箱无效或缺失', field: 'to' }, { status: 400 });
    }
    if (!body) {
      return Response.json({ error: '邮件正文不能为空', field: 'body' }, { status: 400 });
    }

    // 1. 调用 Gmail 发送
    const sendRes = await base44.functions.invoke('sendGmailEmail', { to, subject, body });
    if (sendRes?.data?.error) {
      throw new Error(sendRes.data.error);
    }
    const messageId = sendRes?.data?.messageId || '';

    // 2. 在 Task 实体中记录这次代理执行
    const taskTitle = `📧 已代发邮件给 ${to}`;
    const task = await base44.entities.Task.create({
      title: taskTitle,
      description: [
        instruction ? `用户指令：${instruction}` : '',
        `收件人：${to}`,
        `主题：${subject}`,
        '',
        body,
      ].filter(Boolean).join('\n'),
      status: 'completed',
      category: 'work',
      priority: 'medium',
      tags: ['AI代理', '邮件'],
      completed_at: new Date().toISOString(),
      progress: 100,
    });

    // 3. 创建 Notification 告知用户
    await base44.entities.Notification.create({
      recipient_id: user.id,
      type: 'system',
      title: '邮件已发送 ✉️',
      content: `已代你发送邮件给 ${to}：${subject}`,
      related_entity_id: task.id,
    });

    return Response.json({
      ok: true,
      message: `邮件已发送给 ${to}`,
      to,
      subject,
      task_id: task.id,
      gmail_message_id: messageId,
    });
  } catch (err) {
    console.error('agentSendEmail error:', err);
    return Response.json({ error: err?.message || '执行失败' }, { status: 500 });
  }
});