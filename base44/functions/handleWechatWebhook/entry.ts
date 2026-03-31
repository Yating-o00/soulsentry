import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// --- AES-256-GCM 解密（微信支付 V3 回调通知加密） ---

async function decryptAesGcm(apiV3Key, nonce, ciphertext, associatedData) {
  const keyBytes = new TextEncoder().encode(apiV3Key);
  const nonceBytes = new TextEncoder().encode(nonce);
  const adBytes = new TextEncoder().encode(associatedData);

  // ciphertext 是 base64 编码的
  const cipherBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBytes, additionalData: adBytes },
    cryptoKey,
    cipherBytes
  );

  return new TextDecoder().decode(decrypted);
}

// --- 主函数: 处理微信支付异步回调 ---

Deno.serve(async (req) => {
  // 微信回调使用 POST
  if (req.method !== 'POST') {
    return Response.json({ code: 'FAIL', message: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const API_V3_KEY = Deno.env.get("WECHAT_API_V3_KEY");

    if (!API_V3_KEY) {
      console.error('[WechatWebhook] WECHAT_API_V3_KEY not configured');
      return Response.json({ code: 'FAIL', message: 'Server config error' }, { status: 500 });
    }

    const body = await req.json();

    // 微信支付 V3 回调结构:
    // { id, create_time, event_type, resource_type, resource: { algorithm, ciphertext, nonce, associated_data, original_type } }
    const { event_type, resource } = body;

    console.log(`[WechatWebhook] Received event: ${event_type}`);

    if (event_type !== 'TRANSACTION.SUCCESS') {
      // 非支付成功事件，直接返回成功（避免微信重试）
      console.log(`[WechatWebhook] Ignoring event type: ${event_type}`);
      return Response.json({ code: 'SUCCESS', message: 'OK' });
    }

    if (!resource || !resource.ciphertext || !resource.nonce) {
      console.error('[WechatWebhook] Missing resource data');
      return Response.json({ code: 'FAIL', message: 'Missing resource' }, { status: 400 });
    }

    // 解密回调数据
    const decryptedStr = await decryptAesGcm(
      API_V3_KEY,
      resource.nonce,
      resource.ciphertext,
      resource.associated_data || ''
    );
    const paymentData = JSON.parse(decryptedStr);

    console.log(`[WechatWebhook] Payment data - out_trade_no: ${paymentData.out_trade_no}, trade_state: ${paymentData.trade_state}`);

    // 只处理支付成功
    if (paymentData.trade_state !== 'SUCCESS') {
      console.log(`[WechatWebhook] Trade state is ${paymentData.trade_state}, skipping`);
      return Response.json({ code: 'SUCCESS', message: 'OK' });
    }

    // 从 attach 字段解析用户信息
    let attachData;
    try {
      attachData = JSON.parse(paymentData.attach);
    } catch (e) {
      console.error('[WechatWebhook] Failed to parse attach data:', paymentData.attach);
      return Response.json({ code: 'FAIL', message: 'Invalid attach data' }, { status: 400 });
    }

    const { user_email, credits, pack_id } = attachData;
    const outTradeNo = paymentData.out_trade_no;
    const creditsToAdd = parseInt(credits, 10);

    if (!user_email || !creditsToAdd || creditsToAdd <= 0) {
      console.error('[WechatWebhook] Invalid attach params:', attachData);
      return Response.json({ code: 'FAIL', message: 'Invalid payment metadata' }, { status: 400 });
    }

    // 幂等性检查: 查找是否已经处理过该订单
    const existingTx = await base44.asServiceRole.entities.AICreditTransaction.filter({
      feature: `wechat_completed_${outTradeNo}`
    });
    if (existingTx && existingTx.length > 0) {
      console.log(`[WechatWebhook] Order ${outTradeNo} already processed, skipping duplicate`);
      return Response.json({ code: 'SUCCESS', message: 'Already processed' });
    }

    // 查找用户并充值
    const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
    if (!users || users.length === 0) {
      console.error(`[WechatWebhook] User not found: ${user_email}`);
      return Response.json({ code: 'FAIL', message: 'User not found' }, { status: 404 });
    }

    const user = users[0];
    const currentCredits = user.ai_credits ?? 200;
    const newBalance = currentCredits + creditsToAdd;

    // 更新用户点数
    await base44.asServiceRole.entities.User.update(user.id, { ai_credits: newBalance });

    // 记录充值交易（带唯一标识防重复）
    await base44.asServiceRole.entities.AICreditTransaction.create({
      type: "purchase",
      amount: creditsToAdd,
      balance_after: newBalance,
      description: `微信支付充值 ${creditsToAdd} AI点数 (${pack_id}) 订单号: ${outTradeNo}`,
      feature: `wechat_completed_${outTradeNo}`,
      created_by: user_email,
    });

    console.log(`[WechatWebhook] Successfully added ${creditsToAdd} credits to ${user_email}. Balance: ${currentCredits} -> ${newBalance}`);

    // 返回成功，微信不再重试
    return Response.json({ code: 'SUCCESS', message: 'OK' });
  } catch (error) {
    console.error('[WechatWebhook] Error:', error.message);
    // 返回 FAIL 让微信重试
    return Response.json({ code: 'FAIL', message: error.message }, { status: 500 });
  }
});