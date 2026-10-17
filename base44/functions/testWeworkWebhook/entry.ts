// 测试企业微信群机器人 Webhook 是否可用
// 入参可选：{ webhook_url?: string }；不传则使用当前用户保存的 wework_webhook_url

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const url = (body?.webhook_url || user.wework_webhook_url || '').trim();

    if (!url) {
      return Response.json({ error: '请先填写企业微信 Webhook URL' }, { status: 400 });
    }
    if (!/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send/.test(url)) {
      return Response.json({ error: 'Webhook URL 格式不正确' }, { status: 400 });
    }

    const md = [
      `## ✅ 灵魂哨兵 · 通道测试`,
      `> 你好 **${user.full_name || '朋友'}**，这是一条测试消息。`,
      ``,
      `**📡 Webhook**：连接成功`,
      `**🕐 时间**：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      ``,
      `<font color="info">收到这条消息，说明任务预警链路通畅 🎉</font>`,
    ].join('\n');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content: md } }),
    });
    const data = await res.json().catch(() => ({}));

    if (data.errcode !== 0) {
      return Response.json(
        { success: false, error: data.errmsg || '推送失败', detail: data },
        { status: 502 }
      );
    }
    return Response.json({ success: true, message: '测试消息已发送，请到企业微信群查看' });
  } catch (error) {
    console.error('testWeworkWebhook error:', error);
    return Response.json({ error: error.message || 'Failed' }, { status: 500 });
  }
});