import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data } = body;

    // Only handle comment creation
    if (event?.type !== 'create') {
      return Response.json({ skipped: true, reason: 'not a create event' });
    }

    const comment = data;
    if (!comment?.task_id || !comment?.content) {
      return Response.json({ skipped: true, reason: 'missing task_id or content' });
    }

    // Get the task
    const tasks = await base44.asServiceRole.entities.Task.filter({ id: comment.task_id });
    const task = tasks?.[0];
    if (!task) {
      return Response.json({ skipped: true, reason: 'task not found' });
    }

    // Get all users
    const allUsers = await base44.asServiceRole.entities.User.list();
    const userMap = {};
    for (const u of allUsers) {
      userMap[u.email] = u;
      userMap[u.id] = u;
    }

    // Get commenter info
    const commenter = userMap[comment.created_by];
    const commenterName = commenter?.full_name || comment.created_by || '某用户';

    // Collect recipient emails (creator + assigned users)
    const recipientEmails = new Set();

    // Task creator
    if (task.created_by) {
      recipientEmails.add(task.created_by);
    }

    // Assigned users (shared users) - these are user IDs
    if (task.assigned_to?.length > 0) {
      for (const userId of task.assigned_to) {
        const user = userMap[userId];
        if (user?.email) {
          recipientEmails.add(user.email);
        }
      }
    }

    // Remove the commenter themselves
    recipientEmails.delete(comment.created_by);

    if (recipientEmails.size === 0) {
      return Response.json({ skipped: true, reason: 'no recipients' });
    }

    // Send emails
    const results = [];
    for (const email of recipientEmails) {
      const recipient = userMap[email];
      const recipientName = recipient?.full_name || '用户';

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: `📝 新评论 - ${task.title}`,
        body: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #384877 0%, #3b5aa2 100%); color: white; padding: 24px; border-radius: 16px 16px 0 0;">
              <h2 style="margin: 0; font-size: 18px;">💬 约定收到新评论</h2>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
              <p style="color: #475569; margin: 0 0 16px;">你好 ${recipientName}，</p>
              <p style="color: #475569; margin: 0 0 16px;"><strong>${commenterName}</strong> 在约定 <strong>「${task.title}」</strong> 中发表了新评论：</p>
              <div style="background: #f8fafc; border-left: 4px solid #384877; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0;">
                <p style="color: #334155; margin: 0; white-space: pre-wrap;">${comment.content}</p>
              </div>
              <p style="color: #94a3b8; font-size: 13px; margin: 16px 0 0;">— 来自心签 SoulSentry</p>
            </div>
          </div>
        `,
        from_name: '心签 SoulSentry'
      });

      results.push({ email, sent: true });
    }

    return Response.json({ success: true, notified: results });
  } catch (error) {
    console.error('notifyCommentEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});