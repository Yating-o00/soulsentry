import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 软删除账号：标记为已注销，30 天后由清理任务彻底删除数据。
// 期间用户可联系管理员撤销注销。
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmText = (body?.confirm_text || '').trim();

    // 二次确认：用户必须输入"删除我的账号"
    if (confirmText !== '删除我的账号' && confirmText.toUpperCase() !== 'DELETE MY ACCOUNT') {
      return Response.json({ error: '确认文本不匹配，请输入"删除我的账号"' }, { status: 400 });
    }

    const now = new Date();
    const purgeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await base44.auth.updateMe({
      account_status: 'pending_deletion',
      deletion_requested_at: now.toISOString(),
      deletion_purge_at: purgeAt.toISOString(),
    });

    return Response.json({
      success: true,
      message: '账号已标记为注销，将于 30 天后清除全部数据。如需恢复请在此期间联系支持。',
      purge_at: purgeAt.toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});