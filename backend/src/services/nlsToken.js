import crypto from "node:crypto";

// 阿里云智能语音交互（NLS）Token 管理：
// 用 AK 调 nls-meta 的 CreateToken（RPC V1 签名，与 OCR/SMS 同套凭证），
// Token 有效期以返回的 ExpireTime 为准，缓存并提前 10 分钟刷新。

let cachedToken = null;
let cachedExpireMs = 0;

function getCredentials() {
  const keyId = process.env.ALIYUN_OCR_ACCESS_KEY_ID
    || process.env.ALIYUN_SMS_ACCESS_KEY_ID
    || process.env.ALIYUN_ACCESS_KEY_ID
    || process.env.SMS_ACCESS_KEY_ID;
  const secret = process.env.ALIYUN_OCR_ACCESS_KEY_SECRET
    || process.env.ALIYUN_SMS_ACCESS_KEY_SECRET
    || process.env.ALIYUN_ACCESS_KEY_SECRET
    || process.env.SMS_ACCESS_KEY_SECRET;
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

function percentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

export async function getNlsToken() {
  if (cachedToken && Date.now() < cachedExpireMs - 10 * 60 * 1000) {
    return cachedToken;
  }
  const creds = getCredentials();
  if (!creds) throw new Error("ALIYUN credentials not configured");

  const params = {
    AccessKeyId: creds.keyId,
    Action: "CreateToken",
    Format: "JSON",
    RegionId: "cn-shanghai",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2019-02-28"
  };

  const sortedQuery = Object.keys(params).sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  const stringToSign = `POST&%2F&${percentEncode(sortedQuery)}`;
  const signature = crypto.createHmac("sha1", `${creds.secret}&`)
    .update(stringToSign)
    .digest("base64");

  const url = `https://nls-meta.cn-shanghai.aliyuncs.com/?Signature=${percentEncode(signature)}&${sortedQuery}`;
  const resp = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15000) });
  const data = await resp.json().catch(() => ({}));
  const token = data?.Token?.Id;
  const expireTime = Number(data?.Token?.ExpireTime || 0);
  if (!token) {
    throw new Error(`CreateToken failed: ${JSON.stringify(data).slice(0, 200)}`);
  }
  cachedToken = token;
  // ExpireTime 为秒级时间戳；异常时保守按 1 小时
  cachedExpireMs = expireTime > 0 ? expireTime * 1000 : Date.now() + 60 * 60 * 1000;
  return token;
}
