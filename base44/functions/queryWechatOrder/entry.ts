import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
    var outTradeNo = body.order_no || '';
    if (!outTradeNo) return jr({ error: 'Missing order_no' }, 400);

    // 优先检查本地是否已由 webhook 完成充值（幂等标记）
    var existing = await base44.asServiceRole.entities.AICreditTransaction.filter({
      feature: 'wechat_completed_' + outTradeNo
    });
    if (existing && existing.length > 0) {
      return jr({ trade_state: 'SUCCESS', paid: true, source: 'local' });
    }

    // 否则主动查询微信接口
    var MCHID = Deno.env.get("WECHAT_MCHID") || '';
    var PRIVATE_KEY = Deno.env.get("WECHAT_PRIVATE_KEY") || '';
    var SERIAL_NO = Deno.env.get("WECHAT_SERIAL_NO") || '';
    if (!MCHID || !PRIVATE_KEY || !SERIAL_NO) {
      return jr({ error: 'Missing WeChat config' }, 500);
    }

    var apiPath = '/v3/pay/transactions/out-trade-no/' + outTradeNo + '?mchid=' + MCHID;
    var timestamp = Math.floor(Date.now() / 1000).toString();
    var nonceStr = generateNonceStr();
    var signStr = 'GET\n' + apiPath + '\n' + timestamp + '\n' + nonceStr + '\n\n';
    var signature = await signMessage(PRIVATE_KEY, signStr);
    var authHeader = 'WECHATPAY2-SHA256-RSA2048 mchid="' + MCHID + '",nonce_str="' + nonceStr + '",signature="' + signature + '",timestamp="' + timestamp + '",serial_no="' + SERIAL_NO + '"';

    var wxRes = await fetch('https://api.mch.weixin.qq.com' + apiPath, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader
      }
    });
    var wxData = await wxRes.json();

    if (!wxRes.ok) {
      // 订单未找到通常说明还没被微信受理，视为未支付
      return jr({ trade_state: wxData.code || 'NOT_FOUND', paid: false, detail: wxData.message });
    }

    var paid = wxData.trade_state === 'SUCCESS';

    // 如果微信侧已经成功但本地 webhook 还没到（或被防火墙拦截），主动兜底充值一次
    if (paid) {
      var already = await base44.asServiceRole.entities.AICreditTransaction.filter({
        feature: 'wechat_completed_' + outTradeNo
      });
      if (!already || already.length === 0) {
        try {
          var attach = JSON.parse(wxData.attach || '{}');
          var creditsToAdd = parseInt(attach.credits, 10);
          var userEmail = attach.user_email;
          if (creditsToAdd > 0 && userEmail) {
            var users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            if (users && users.length > 0) {
              var u = users[0];
              var curr = u.ai_credits == null ? 200 : u.ai_credits;
              var newBal = curr + creditsToAdd;
              await base44.asServiceRole.entities.User.update(u.id, { ai_credits: newBal });
              await base44.asServiceRole.entities.AICreditTransaction.create({
                type: 'purchase',
                amount: creditsToAdd,
                balance_after: newBal,
                description: '微信支付充值 ' + creditsToAdd + ' AI点数 (' + (attach.pack_id || '') + ') 订单号: ' + outTradeNo + ' [主动查询]',
                feature: 'wechat_completed_' + outTradeNo,
                created_by: userEmail
              });
              console.log('[queryWechatOrder] Fallback credited', creditsToAdd, 'to', userEmail);
            }
          }
        } catch (e) {
          console.error('[queryWechatOrder] Fallback credit failed:', e);
        }
      }
    }

    return jr({ trade_state: wxData.trade_state, paid: paid, source: 'wechat' });
  } catch (e) {
    console.error('[queryWechatOrder] error:', e);
    return jr({ error: String(e) }, 500);
  }
});