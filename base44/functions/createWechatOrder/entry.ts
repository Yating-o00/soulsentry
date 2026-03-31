import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function jr(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function importPrivateKey(pemKey) {
  var normalized = pemKey.replace(/\\n/g, '\n');
  var match = normalized.match(/-----BEGIN[^-]*-----([^-]+)-----END[^-]*-----/);
  var b64;
  if (match) {
    b64 = match[1].replace(/[\r\n\s]/g, '');
  } else {
    b64 = pemKey.replace(/-----[A-Z ]+-----/g, '').replace(/\\n/g, '').replace(/[\r\n\s]/g, '');
  }
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return await crypto.subtle.importKey(
    'pkcs8', bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function signMessage(privateKeyPem, message) {
  var key = await importPrivateKey(privateKeyPem);
  var encoded = new TextEncoder().encode(message);
  var sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoded);
  var arr = new Uint8Array(sig);
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

Deno.serve(async (req) => {
  try {
    var base44 = createClientFromRequest(req);
    var user = await base44.auth.me();
    if (!user) return jr({ error: 'Unauthorized' }, 401);

    var body;
    try { body = await req.json(); } catch (_e) { body = {}; }

    var packId = body.packId || '';
    var packName = body.packName || '';
    var credits = body.credits || 0;
    var price = body.price || 0;
    if (!packId || !credits || !price) return jr({ error: 'Missing fields' }, 400);

    var APPID = Deno.env.get("WECHAT_APPID") || '';
    var MCHID = Deno.env.get("WECHAT_MCHID") || '';
    var PRIVATE_KEY = Deno.env.get("WECHAT_PRIVATE_KEY") || '';
    var SERIAL_NO = Deno.env.get("WECHAT_SERIAL_NO") || '';
    if (!APPID || !MCHID || !PRIVATE_KEY || !SERIAL_NO) {
      return jr({ error: 'Missing WeChat Pay config' }, 500);
    }

    var outTradeNo = 'SS' + Date.now() + Math.random().toString(36).substring(2, 8).toUpperCase();
    var totalFen = Math.round(price * 100);
    var timestamp = Math.floor(Date.now() / 1000).toString();
    var nonceStr = generateNonceStr();
    var apiPath = '/v3/pay/transactions/native';

    // Build notify_url from the handleWechatWebhook function
    var appId = Deno.env.get("BASE44_APP_ID") || '';
    var notifyUrl = 'https://app.base44.com/api/v1/apps/' + appId + '/functions/handleWechatWebhook/execute';

    var orderBody = {
      appid: APPID,
      mchid: MCHID,
      description: 'SoulSentry AI - ' + (packName || packId),
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      amount: { total: totalFen, currency: 'CNY' },
      attach: JSON.stringify({ user_email: user.email, pack_id: packId, credits: credits })
    };
    var bodyStr = JSON.stringify(orderBody);
    var signStr = 'POST\n' + apiPath + '\n' + timestamp + '\n' + nonceStr + '\n' + bodyStr + '\n';

    var signature = await signMessage(PRIVATE_KEY, signStr);

    var authHeader = 'WECHATPAY2-SHA256-RSA2048 mchid="' + MCHID + '",nonce_str="' + nonceStr + '",signature="' + signature + '",timestamp="' + timestamp + '",serial_no="' + SERIAL_NO + '"';

    var wxRes = await fetch('https://api.mch.weixin.qq.com' + apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader
      },
      body: bodyStr
    });

    var wxData = await wxRes.json();
    console.log('[WX] API response status:', wxRes.status, 'body:', JSON.stringify(wxData));

    if (!wxRes.ok) {
      return jr({ error: wxData.message || 'WeChat API error', code: wxData.code, detail: wxData }, wxRes.status);
    }

    return jr({
      code_url: wxData.code_url,
      order_no: outTradeNo
    });
  } catch (e) {
    console.error('[WX] error:', e);
    return jr({ error: String(e) }, 500);
  }
});