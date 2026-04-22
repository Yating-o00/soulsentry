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
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@soulsentry.app';

    if (!publicKey || !privateKey) {
      return Response.json(
        { error: 'VAPID keys not configured' },
        { status: 500 }
      );
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { user_email, title, body, url, tag, data } = await req.json();
    if (!title || !body) {
      return Response.json({ error: 'title and body are required' }, { status: 400 });
    }

    // 鉴权：非 admin 只能给自己发
    const targetEmail = user_email || me.email;
    if (targetEmail !== me.email && me.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 查找目标用户的订阅（存在 UserPreference.push_subscription，按 created_by 过滤）
    const prefs = await base44.asServiceRole.entities.UserPreference.filter(
      { created_by: targetEmail },
      '-updated_date',
      1
    );
    const pref = prefs?.[0];
    const sub = pref?.push_subscription;

    if (!pref?.push_enabled || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return Response.json({ error: 'User has no active push subscription' }, { status: 404 });
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/',
      tag: tag || 'soulsentry',
      data: data || {}
    });

    try {
      const result = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 60 * 60 } // 1 小时内送达有效
      );
      return Response.json({ success: true, statusCode: result.statusCode });
    } catch (pushErr) {
      // 410 / 404 表示订阅已失效，清除它
      if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
        await base44.asServiceRole.entities.UserPreference.update(pref.id, {
          push_enabled: false,
          push_subscription: null
        });
        return Response.json(
          { error: 'Subscription expired, cleared', statusCode: pushErr.statusCode },
          { status: 410 }
        );
      }
      throw pushErr;
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});