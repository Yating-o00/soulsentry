import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { task, recipient_email } = await req.json();

    if (!task) {
      return Response.json({ error: 'Task is required' }, { status: 400 });
    }

    const recipientEmail = recipient_email || user.email;
    
    // 构建邮件内容
    const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">⏰ 任务提醒</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <h2 style="color: #1f2937; margin-top: 0; font-size: 22px;">${task.title}</h2>
      
      ${task.description ? `
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #4b5563; margin: 0; line-height: 1.6;">${task.description}</p>
        </div>
      ` : ''}
      
      <div style="margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          ${task.reminder_time ? `
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">⏰ 截止时间：</td>
              <td style="padding: 10px 0; color: #1f2937;">${new Date(task.reminder_time).toLocaleString('zh-CN', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</td>
            </tr>
          ` : ''}
          ${task.priority ? `
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">🎯 优先级：</td>
              <td style="padding: 10px 0;">
                <span style="background: ${task.priority === 'urgent' ? '#fee2e2' : task.priority === 'high' ? '#fef3c7' : task.priority === 'medium' ? '#dbeafe' : '#f3f4f6'}; 
                             color: ${task.priority === 'urgent' ? '#dc2626' : task.priority === 'high' ? '#d97706' : task.priority === 'medium' ? '#2563eb' : '#6b7280'}; 
                             padding: 4px 12px; 
                             border-radius: 12px; 
                             font-weight: 600;
                             font-size: 13px;">
                  ${task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
                </span>
              </td>
            </tr>
          ` : ''}
          ${task.category ? `
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-weight: 600;">📁 分类：</td>
              <td style="padding: 10px 0; color: #1f2937;">${
                task.category === 'work' ? '工作' : 
                task.category === 'personal' ? '个人' : 
                task.category === 'health' ? '健康' : 
                task.category === 'study' ? '学习' : 
                task.category === 'family' ? '家庭' : 
                task.category === 'shopping' ? '购物' : 
                task.category === 'finance' ? '财务' : '其他'
              }</td>
            </tr>
          ` : ''}
        </table>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <a href="${Deno.env.get('APP_URL') || 'https://app.base44.com'}" 
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; 
                  padding: 12px 30px; 
                  text-decoration: none; 
                  border-radius: 8px; 
                  font-weight: 600;
                  display: inline-block;
                  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
          查看详情
        </a>
      </div>
    </div>
    
    <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 13px;">
      <p>此邮件由 Soul Sentry 自动发送</p>
      <p>如需管理提醒设置，请登录应用</p>
    </div>
  </div>
</div>
    `;

    // 使用 Core.SendEmail 发送邮件
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: recipientEmail,
      subject: `⏰ 任务提醒: ${task.title}`,
      body: emailBody
    });

    return Response.json({ 
      success: true, 
      message: `Email sent to ${recipientEmail}` 
    });

  } catch (error) {
    console.error('Error sending email reminder:', error);
    return Response.json({ 
      error: error.message || 'Failed to send email' 
    }, { status: 500 });
  }
});