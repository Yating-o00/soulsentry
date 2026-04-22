import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 保存或清除用户的 Web Push 订阅对象。存入 UserPreference.push_subscription。
 * 入参：{ subscription: {endpoint, keys:{p256dh,auth}} | null, user_agent? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { subscription, user_agent } = await req.json();

    const patch = subscription
      ? {
          push_enabled: true,
          push_subscription: {
            endpoint: subscription.endpoint,
            keys: subscription.keys || {},
            user_agent: user_agent || '',
            subscribed_at: new Date().toISOString()
          }
        }
      : { push_enabled: false, push_subscription: null };

    const existing = await base44.entities.UserPreference.list('-updated_date', 1);
    if (existing && existing.length > 0) {
      await base44.entities.UserPreference.update(existing[0].id, patch);
    } else {
      await base44.entities.UserPreference.create(patch);
    }

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});