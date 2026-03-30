import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { packId, packName, credits, price } = await req.json();

    if (!packId || !credits || !price) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const WECHAT_API_KEY = Deno.env.get("Wechat_API");

    // Generate a unique order number
    const outTradeNo = `SS${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const totalFee = Math.round(price * 100); // Convert yuan to fen

    // Note: This is a simplified WeChat Pay Native (QR code) flow.
    // In production, you need to:
    // 1. Use proper WeChat Pay API v3 with certificates
    // 2. Sign the request with your merchant private key
    // 3. Use the correct API endpoint for your payment scenario
    
    // For now, we create a pending order record and return order info
    // The actual WeChat Pay integration requires merchant ID, certificates, etc.
    
    // Store the pending order
    await base44.asServiceRole.entities.AICreditTransaction.create({
      type: "purchase",
      amount: 0, // Will be updated after payment confirmation
      balance_after: user.ai_credits ?? 200,
      description: `微信支付订单创建 - ${packName} (${credits}点) 订单号: ${outTradeNo}`,
      feature: `wechat_pending_${outTradeNo}`,
      created_by: user.email,
    });

    return Response.json({ 
      success: true,
      order_no: outTradeNo,
      message: "微信支付订单已创建。请注意：完整的微信支付集成需要在微信商户平台配置证书和回调地址。当前为演示模式。",
      // In production, this would return a QR code URL (code_url) for Native Pay
      // or a prepay_id for JSAPI/Mini Program Pay
      demo_mode: true,
      pack: { id: packId, name: packName, credits, price }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});