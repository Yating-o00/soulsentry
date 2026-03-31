import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
// test log to verify function loads
console.log('[WechatOrder] Module loaded');

async function importPrivateKey(pemKey) {
  var pemBody = pemKey
    .replace(/-----[A-Z ]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .replace(/ /g, '');

  var cleaned = pemBody.replace(/[^A-Za-z0-9+/=]/g, '');
  var binary = atob(cleaned);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signMessage(privateKeyPem, message) {
  var key = await importPrivateKey(privateKeyPem);
  var encoded = new TextEncoder().encode(message);
  var signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoded);
  var arr = new Uint8Array(signature);
  var str = '';
  for (var i = 0; i < arr.length; i++) {
    str += String.fromCharCode(arr[i]);
  }
  return btoa(str);
}

function generateNonceStr() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  var arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  for (var i = 0; i < 32; i++) {
    result += chars[arr[i] % chars.length];
  }
  return result;
}

Deno.serve(async function(req) {
  try {
    console.log('[WechatOrder] Request received');
    var base44 = createClientFromRequest(req);
    console.log('[WechatOrder] base44 client created');
    var user = await base44.auth.me();
    console.log('[WechatOrder] user:', user ? user.email : 'null');
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    var body = await req.json();
    var packId = body.packId;
    var packName = body.packName;
    var credits = body.credits;
    var price = body.price;

    if (!packId || !credits || !price) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    var APPID = Deno.env.get("WECHAT_APPID");
    var MCHID = Deno.env.get("WECHAT_MCHID");
    var PRIVATE_KEY = Deno.env.get("WECHAT_PRIVATE_KEY");
    var SERIAL_NO = Deno.env.get("WECHAT_SERIAL_NO");

    if (!APPID || !MCHID || !PRIVATE_KEY || !SERIAL_NO) {
      return new Response(JSON.stringify({ error: 'Missing wechat config' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    var outTradeNo = 'SS' + Date.now() + Math.random().toString(36).substring(2, 8).toUpperCase();
    var totalFen = Math.round(price * 100);

    var reqUrl = new URL(req.url);
    var notifyUrl = reqUrl.origin + '/handleWechatWebhook';

    var timestamp = Math.floor(Date.now() / 1000).toString();
    var nonceStr = generateNonceStr();
    var apiPath = '/v3/pay/transactions/native';

    var orderBody = {
      appid: APPID,
      mchid: MCHID,
      description: 'SoulSentry AI - ' + (packName || packId),
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      amount: { total: totalFen, currency: 'CNY' },
      attach: JSON.stringify({ user_email: user.email, user_id: user.id, pack_id: packId, credits: credits })
    };

    var bodyStr = JSON.stringify(orderBody);
    var signStr = 'POST\n' + apiPath + '\n' + timestamp + '\n' + nonceStr + '\n' + bodyStr + '\n';
    var signature = await signMessage(PRIVATE_KEY, signStr);
    var authorization = 'WECHATPAY2-SHA256-RSA2048 mchid="' + MCHID + '",nonce_str="' + nonceStr + '",signature="' + signature + '",timestamp="' + timestamp + '",serial_no="' + SERIAL_NO + '"';

    var wxResponse = await fetch('https://api.mch.weixin.qq.com' + apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization
      },
      body: bodyStr
    });

    var wxData = await wxResponse.json();

    if (!wxResponse.ok) {
      return new Response(JSON.stringify({ error: wxData.message || 'WeChat API error', code: wxData.code }), { status: wxResponse.status, headers: { 'Content-Type': 'application/json' } });
    }

    await base44.asServiceRole.entities.AICreditTransaction.create({
      type: 'purchase',
      amount: 0,
      balance_after: user.ai_credits || 200,
      description: 'WeChat order - ' + packName + ' (' + credits + ' credits) #' + outTradeNo,
      feature: 'wechat_pending_' + outTradeNo,
      created_by: user.email
    });

    return new Response(JSON.stringify({
      success: true,
      order_no: outTradeNo,
      code_url: wxData.code_url,
      pack: { id: packId, name: packName, credits: credits, price: price }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[WechatOrder] Caught error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});