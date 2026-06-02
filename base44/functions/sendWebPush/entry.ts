import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import webpush from 'npm:web-push@3.6.7';

/**
 * 向指定用户（或当前登录用户）发送一条 Web Push 通知。
 * 即使用户已关闭页面，Service Worker 也能接收并弹出通知。
 *
 * 入参 JSON:
 *   {
 *     user_email?: string,          // 指定接收者邮箱；不传则发给当前登录用户
 *     title: string,
 *     body: string,
 *     url?: string,                 // 点击通知后跳转路径，默认 "/"
 *     tag?: string,                 // 通知聚合标签
 *     data?: object                 // 附加自定义数据
 *   }
 *
 * 权限：admin 可任意发给他人；普通用户只能发给自己（用于本地预览/测试）。
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    let subject = Deno.env.get('VAPID_SUBJECT') || '';

    if (!publicKey || !privateKey) {
      return Response.json(
        { error: 'VAPID keys not configured' },
        { status: 500 }
      );
    }

    // VAPID subject 必须是合法的 mailto: 或 https: URL。
    // 若密钥被误填为其它内容（如把公钥填进来），回退到安全默认值，避免 web-push 抛错导致整条推送失败。
    if (!/^(mailto:|https:\/\/)/.test(subject)) {
      subject = 'mailto:admin@soulsentry.app';
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { user_email, title, body, url, tag, data, requireInteraction, vibrate, actions } = await req.json();
    if (!title || !body) {
      return Response.json({ error: 'title and body are required' }, { status: 400 });
    }

    // 鉴权：非 admin 只能给自己发
    const targetEmail = user_email || me.email;
    if (targetEmail !== me.email && me.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 解析目标用户 id（UserPreference 按内置字段 created_by_id 归属，而非邮箱）
    let targetUserId = null;
    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
      targetUserId = users?.[0]?.id || null;
    } catch (_) { /* ignore */ }

    // 查找目标用户的订阅（存在 UserPreference.push_subscription）
    let pref = null;
    if (targetUserId) {
      const prefs = await base44.asServiceRole.entities.UserPreference.filter(
        { created_by_id: targetUserId },
        '-updated_date',
        1
      );
      pref = prefs?.[0] || null;
    }
    // 兼容旧数据：若按 id 未找到，尝试按 created_by 邮箱兜底
    if (!pref) {
      const legacy = await base44.asServiceRole.entities.UserPreference.filter(
        { created_by: targetEmail },
        '-updated_date',
        1
      );
      pref = legacy?.[0] || null;
    }
    const sub = pref?.push_subscription;

    if (!pref?.push_enabled || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return Response.json({ error: 'User has no active push subscription' }, { status: 404 });
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/',
      tag: tag || `soulsentry-${Date.now()}`,
      requireInteraction: !!requireInteraction,
      vibrate: vibrate || [200, 100, 200],
      actions: actions || undefined,
      data: data || {}
    });

    try {
      const result = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        {
          TTL: 60 * 60 * 4,        // 4 小时内送达有效（设备离线时给更长重试窗口）
          urgency: requireInteraction ? 'high' : 'normal'
        }
      );
      return Response.json({ success: true, statusCode: result.statusCode });
    } catch (pushErr) {
      // 410 / 404 = 订阅失效；403 = VAPID 密钥与订阅不匹配（如更换了 VAPID 密钥后旧订阅作废）。
      // 这些情况都说明该订阅已不可用，清除它并提示用户重新开启推送。
      const sc = pushErr.statusCode;
      if (sc === 410 || sc === 404 || sc === 403) {
        await base44.asServiceRole.entities.UserPreference.update(pref.id, {
          push_enabled: false,
          push_subscription: null
        });
        return Response.json(
          { error: 'Subscription invalid, cleared. User must re-enable push.', statusCode: sc },
          { status: 410 }
        );
      }
      throw pushErr;
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});