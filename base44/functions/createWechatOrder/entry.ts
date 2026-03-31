import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// --- 微信支付 V3 签名工具 ---

async function importPrivateKey(pemKey) {
  const pemBody = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signMessage(privateKeyPem, message) {
  const key = await importPrivateKey(privateKeyPem);
  const encoded = new TextEncoder().encode(message);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function generateNonceStr(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) {
    result += chars[arr[i] % chars.length];
  }
  return result;
}

async function buildAuthorizationHeader(method, url, body, mchid, serialNo, privateKey) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = generateNonceStr();
  // url 只取 path + query 部分
  const urlObj = new URL(url, 'https://api.mch.weixin.qq.com');
  const urlPath = urlObj.pathname + urlObj.search;

  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body || ''}\n`;
  const signature = await signMessage(privateKey, message);

  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

// --- 主函数 ---

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

    const APPID = Deno.env.get("WECHAT_APPID");
    const MCHID = Deno.env.get("WECHAT_MCHID");
    const PRIVATE_KEY = Deno.env.get("WECHAT_PRIVATE_KEY");
    const SERIAL_NO = Deno.env.get("WECHAT_SERIAL_NO");

    if (!APPID || !MCHID || !PRIVATE_KEY || !SERIAL_NO) {
      return Response.json({ error: '微信支付配置不完整，请联系管理员' }, { status: 500 });
    }

    // 生成唯一商户订单号
    const outTradeNo = `SS${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const totalFen = Math.round(price * 100); // 元 → 分

    // 回调地址: 使用当前 origin 下的 handleWechatWebhook 函数
    const origin = req.headers.get('origin') || 'https://app.base44.com';
    // Base44 函数的公网 URL 格式（从 dashboard -> code -> functions 获取）
    // 回调地址需要是公网可访问的，这里用 req.url 推导
    const reqUrl = new URL(req.url);
    const notifyUrl = `${reqUrl.origin}/handleWechatWebhook`;

    // 构造微信支付 Native 统一下单请求体
    const orderBody = {
      appid: APPID,
      mchid: MCHID,
      description: `SoulSentry AI 点数 - ${packName || packId}`,
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      amount: {
        total: totalFen,
        currency: "CNY"
      },
      // 附加数据: 用于回调时识别用户和点数
      attach: JSON.stringify({
        user_email: user.email,
        user_id: user.id,
        pack_id: packId,
        credits: credits
      })
    };

    const bodyStr = JSON.stringify(orderBody);
    const apiUrl = 'https://api.mch.weixin.qq.com/v3/pay/transactions/native';

    const authorization = await buildAuthorizationHeader(
      'POST', apiUrl, bodyStr, MCHID, SERIAL_NO, PRIVATE_KEY
    );

    console.log(`[WechatPay] Creating order: ${outTradeNo}, amount: ${totalFen} fen, user: ${user.email}`);

    const wxResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
      },
      body: bodyStr,
    });

    const wxData = await wxResponse.json();

    if (!wxResponse.ok) {
      console.error('[WechatPay] API error:', JSON.stringify(wxData));
      return Response.json({
        error: wxData.message || '微信支付下单失败',
        code: wxData.code,
        detail: wxData.detail
      }, { status: wxResponse.status });
    }

    // Native 支付返回 code_url（二维码链接）
    const codeUrl = wxData.code_url;

    // 记录待支付订单
    await base44.asServiceRole.entities.AICreditTransaction.create({
      type: "purchase",
      amount: 0,
      balance_after: user.ai_credits ?? 200,
      description: `微信支付订单创建 - ${packName} (${credits}点) 订单号: ${outTradeNo}`,
      feature: `wechat_pending_${outTradeNo}`,
      created_by: user.email,
    });

    console.log(`[WechatPay] Order created successfully: ${outTradeNo}, code_url: ${codeUrl}`);

    return Response.json({
      success: true,
      order_no: outTradeNo,
      code_url: codeUrl, // 前端用此生成二维码供用户扫码
      pack: { id: packId, name: packName, credits, price }
    });
  } catch (error) {
    console.error('[WechatPay] Unexpected error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});