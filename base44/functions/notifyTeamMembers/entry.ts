import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse payload from automation
        const payload = await req.json();
        const task = payload.data;

        // Check if task exists and has assigned members
        if (!task || !task.assigned_to || !Array.isArray(task.assigned_to) || task.assigned_to.length === 0) {
            return Response.json({ message: "No team members assigned or invalid task data" });
        }

        console.log(`Processing task ${task.id}: Assigned to ${task.assigned_to.length} users`);

        // Fetch users using service role to ensure access to emails
        const userPromises = task.assigned_to.map(userId => 
            base44.asServiceRole.entities.User.filter({ id: userId })
                .then(res => res[0])
                .catch(err => {
                    console.error(`Failed to fetch user ${userId}:`, err);
                    return null;
                })
        );
        
        const users = (await Promise.all(userPromises)).filter(u => u && u.email);

        if (users.length === 0) {
            return Response.json({ message: "No valid users found with emails" });
        }

        // Prepare email content
        const timeStr = task.reminder_time 
            ? new Date(task.reminder_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) 
            : '未设定时间';
            
        const priorityLabels = {
            low: "低",
            medium: "中",
            high: "高",
            urgent: "紧急"
        };
        const priorityStr = priorityLabels[task.priority] || task.priority;

        // Send emails
        const emailPromises = users.map(user => {
            console.log(`Sending email to ${user.email}`);
            return base44.integrations.Core.SendEmail({
                to: user.email,
                subject: `[新约定] 您被分配了任务: ${task.title}`,
                body: `
                    <div style="font-family: sans-serif; color: #333;">
                        <h2>新约定通知</h2>
                        <p>您好 ${user.full_name || '用户'},</p>
                        <p>您已被分配参与以下约定：</p>
                        <div style="background: #f5f7fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                            <h3 style="margin-top: 0; color: #384877;">${task.title}</h3>
                            <p><strong>描述:</strong> ${task.description || '无'}</p>
                            <p><strong>时间:</strong> ${timeStr}</p>
                            <p><strong>优先级:</strong> <span style="color: ${task.priority === 'urgent' ? 'red' : 'inherit'}">${priorityStr}</span></p>
                        </div>
                        <p>请登录 SoulSentry 应用查看详情并进行处理。</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                        <p style="font-size: 12px; color: #888;">此邮件由系统自动发送，请勿回复。</p>
                    </div>
                `
            }).catch(err => {
                console.error(`Failed to send email to ${user.email}:`, err);
                return { error: err.message };
            });
        });

        await Promise.all(emailPromises);

        return Response.json({ 
            success: true, 
            processed_count: task.assigned_to.length,
            sent_count: users.length 
        });

    } catch (error) {
        console.error("Error in notifyTeamMembers:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});