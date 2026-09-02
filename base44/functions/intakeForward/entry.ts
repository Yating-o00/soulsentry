import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// 转发即执行：统一收件入口。
// 应用内「转发收件箱」与后续系统级入口（iOS 快捷指令 / 分享扩展 / 邮件转发地址 / 浏览器划词）
// 都通过这一个接口投递，数据契约保持一致：{ content, source, attachments }
// 流程：落 IntakeItem → 调 triageAgreement 拆解 → 机器部分入自动执行队列 → 人做部分生成约定草稿

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const content = String(body.content || '').trim();
    const source = body.source || 'paste';
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!content && attachments.length === 0) {
      return Response.json({ error: 'content 或 attachments 至少提供一个' }, { status: 400 });
    }

    const item = await base44.entities.IntakeItem.create({
      source,
      raw_content: content || `（${attachments.length} 个附件）`,
      attachments,
      status: 'triaging',
    });

    try {
      const triageRes = await base44.functions.invoke('triageAgreement', {
        input_text: content || attachments.map((a) => a.file_name).join('、'),
        task_title: `转发内容（${source}）`,
      });
      const t = triageRes?.data || {};

      // 人做部分 → 生成约定草稿（pending，用户一键收纳/删除）
      const humanParts = [];
      for (const h of (t.human_parts || [])) {
        let taskId = null;
        try {
          const created = await base44.entities.Task.create({
            title: h.title,
            description: [h.detail, h.time_hint ? `时间提示：${h.time_hint}` : ''].filter(Boolean).join('\n'),
            status: 'pending',
            priority: 'medium',
            tags: ['转发收件'],
          });
          taskId = created.id;
        } catch (e) {
          console.warn('[intakeForward] create draft task failed:', e?.message || e);
        }
        humanParts.push({ ...h, task_id: taskId, adopted: false });
      }

      const updated = await base44.entities.IntakeItem.update(item.id, {
        status: 'triaged',
        summary: t.summary || '',
        machine_parts: t.machine_parts || [],
        human_parts: humanParts,
      });

      return Response.json({ success: true, item: updated });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || '拆解失败';
      const failed = await base44.entities.IntakeItem.update(item.id, {
        status: 'failed',
        error_message: msg,
      });
      return Response.json({ success: false, item: failed, error: msg }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});