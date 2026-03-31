import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function jr(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function importPrivateKey(pemKey) {
  console.log('[WX] pk raw first 60:', pemKey.substring(0, 60));
  console.log('[WX] pk raw last 60:', pemKey.substring(pemKey.length - 60));
  
  // Handle escaped newlines from env var
  var normalized = pemKey.replace(/\\n/g, '\n');
  
  // Extract base64 content between PEM headers
  var match = normalized.match(/-----BEGIN[^-]*-----([^-]+)-----END[^-]*-----/);
  var b64;
  if (match) {
    b64 = match[1].replace(/[\r\n\s]/g, '');
    console.log('[WX] extracted b64 from PEM headers, length:', b64.length);
  } else {
    // No PEM headers, treat entire string as base64
    b64 = pemKey.replace(/-----[A-Z ]+-----/g, '').replace(/\\n/g, '').replace(/[\r\n\s]/g, '');
    console.log('[WX] no PEM headers found, raw b64 length:', b64.length);
  }
  
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  console.log('[WX] decoded bytes length:', bytes.length);
  
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
    console.log('[WX] step 1');
    var base44 = createClientFromRequest(req);
    var user = await base44.auth.me();
    if (!user) return jr({ error: 'Unauthorized' }, 401);
    console.log('[WX] step 2 user ok');

    var body;
    try { body = await req.json(); } catch (_e) { body = {}; }
    console.log('[WX] step 3 body ok');

    var packId = body.packId || '';
    var packName = body.packName || '';
    var credits = body.credits || 0;
    var price = body.price || 0;
    if (!packId || !credits || !price) return jr({ error: 'Missing fields' }, 400);
    console.log('[WX] step 4 fields ok');

    var APPID = Deno.env.get("WECHAT_APPID") || '';
    var MCHID = Deno.env.get("WECHAT_MCHID") || '';
    var PRIVATE_KEY = Deno.env.get("WECHAT_PRIVATE_KEY") || '';
    var SERIAL_NO = Deno.env.get("WECHAT_SERIAL_NO") || '';
    console.log('[WX] step 5 env ok, pk length:', PRIVATE_KEY.length);

    if (!APPID || !MCHID || !PRIVATE_KEY || !SERIAL_NO) {
      return jr({ error: 'Missing env vars' }, 500);
    }

    var outTradeNo = 'SS' + Date.now() + Math.random().toString(36).substring(2, 8).toUpperCase();
    var totalFen = Math.round(price * 100);
    var timestamp = Math.floor(Date.now() / 1000).toString();
    var nonceStr = generateNonceStr();
    var apiPath = '/v3/pay/transactions/native';
    console.log('[WX] step 6 vars ready');

    var orderBody = {
      appid: APPID,
      mchid: MCHID,
      description: 'SoulSentry AI - ' + (packName || packId),
      out_trade_no: outTradeNo,
      notify_url: 'https://example.com/webhook',
      amount: { total: totalFen, currency: 'CNY' },
      attach: JSON.stringify({ user_email: user.email, pack_id: packId, credits: credits })
    };
    var bodyStr = JSON.stringify(orderBody);
    var signStr = 'POST\n' + apiPath + '\n' + timestamp + '\n' + nonceStr + '\n' + bodyStr + '\n';
    console.log('[WX] step 7 pre-sign');

    var signature;
    try {
      signature = await signMessage(PRIVATE_KEY, signStr);
    } catch (signErr) {
      var errInfo = {
        message: signErr ? signErr.message : 'no message',
        name: signErr ? signErr.name : 'no name',
        str: String(signErr),
        type: typeof signErr,
        keys: signErr ? Object.keys(signErr) : [],
        stack: signErr ? signErr.stack : 'no stack',
        pkFirst50: PRIVATE_KEY.substring(0, 50),
        pkLast50: PRIVATE_KEY.substring(PRIVATE_KEY.length - 50)
      };
      return jr({ error: 'Sign failed', detail: errInfo }, 500);
    }

    return jr({ msg: 'signed ok', sigLen: signature.length });
  } catch (e) {
    console.error('[WX] err', e);
    return jr({ error: String(e) }, 500);
  }
});