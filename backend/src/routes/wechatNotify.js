import { getWechatMerchantConfig, decryptWechatResource, verifyWechatNotifySignature } from "../lib/wechatPay.js";
import { markWechatOrderPaid } from "../services/wechatOrders.js";

export async function handleWechatNotify(req, res) {
  const cfg = await getWechatMerchantConfig();
  if (!cfg) {
    return res.status(503).json({ code: "FAIL", message: "wechat_not_configured" });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
  const ok = await verifyWechatNotifySignature({ headers: req.headers, body: raw }, cfg);
  if (!ok) {
    return res.status(401).json({ code: "FAIL", message: "invalid_signature" });
  }

  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return res.status(400).json({ code: "FAIL", message: "invalid_json" });
  }

  const resource = payload?.resource;
  if (!resource?.ciphertext || !resource?.nonce) {
    return res.status(400).json({ code: "FAIL", message: "missing_resource" });
  }

  let decrypted = null;
  try {
    decrypted = decryptWechatResource({
      apiV3Key: cfg.apiV3Key,
      associated_data: resource.associated_data || "",
      nonce: resource.nonce,
      ciphertext: resource.ciphertext
    });
  } catch (_error) {
    return res.status(400).json({ code: "FAIL", message: "decrypt_failed" });
  }

  const outTradeNo = decrypted?.out_trade_no;
  const tradeState = decrypted?.trade_state;
  const transactionId = decrypted?.transaction_id || null;
  const successTime = decrypted?.success_time || null;
  if (!outTradeNo) {
    return res.status(400).json({ code: "FAIL", message: "missing_out_trade_no" });
  }

  if (tradeState !== "SUCCESS") {
    return res.json({ code: "SUCCESS", message: "OK" });
  }

  await markWechatOrderPaid({
    orderNo: outTradeNo,
    transactionId,
    paidAt: successTime ? new Date(successTime) : null
  });

  return res.json({ code: "SUCCESS", message: "OK" });
}
