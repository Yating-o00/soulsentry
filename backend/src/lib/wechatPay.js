import crypto from "node:crypto";
import fs from "node:fs/promises";
import { env } from "../config/env.js";

const BASE_URL = "https://api.mch.weixin.qq.com";

function randomString(length = 32) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

function toPemPrivateKey(keyText) {
  const text = String(keyText || "").trim();
  if (!text) return null;
  if (text.includes("BEGIN")) return text;
  return `-----BEGIN PRIVATE KEY-----\n${text}\n-----END PRIVATE KEY-----`;
}

async function loadMerchantPrivateKey() {
  if (env.WECHAT_PRIVATE_KEY) {
    return toPemPrivateKey(env.WECHAT_PRIVATE_KEY.replace(/\\n/g, "\n"));
  }
  if (env.WECHAT_PRIVATE_KEY_PATH) {
    const content = await fs.readFile(env.WECHAT_PRIVATE_KEY_PATH, "utf8");
    return toPemPrivateKey(content);
  }
  return null;
}

export async function getWechatMerchantConfig() {
  const appid = env.WECHAT_APPID || null;
  const mchid = env.WECHAT_MCHID || null;
  const serialNo = env.WECHAT_SERIAL_NO || null;
  const apiV3Key = env.WECHAT_API_V3_KEY || null;
  const notifyUrl = env.WECHAT_NOTIFY_URL || null;
  const privateKey = await loadMerchantPrivateKey();

  if (!appid || !mchid || !serialNo || !apiV3Key || !notifyUrl || !privateKey) {
    return null;
  }

  return { appid, mchid, serialNo, apiV3Key, notifyUrl, privateKey };
}

function buildSignatureMessage(method, urlPathWithQuery, timestamp, nonceStr, bodyText) {
  return [
    String(method || "").toUpperCase(),
    urlPathWithQuery,
    String(timestamp),
    nonceStr,
    bodyText || "",
    ""
  ].join("\n");
}

function signMessage(privateKey, message) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(privateKey, "base64");
}

function buildAuthorizationHeader({ mchid, serialNo, nonceStr, timestamp, signature }) {
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

async function wechatRequest(method, urlPathWithQuery, bodyObj, cfg) {
  const bodyText = bodyObj ? JSON.stringify(bodyObj) : "";
  const nonceStr = randomString(32);
  const timestamp = Math.floor(Date.now() / 1000);
  const message = buildSignatureMessage(method, urlPathWithQuery, timestamp, nonceStr, bodyText);
  const signature = signMessage(cfg.privateKey, message);
  const authorization = buildAuthorizationHeader({
    mchid: cfg.mchid,
    serialNo: cfg.serialNo,
    nonceStr,
    timestamp,
    signature
  });

  const res = await fetch(`${BASE_URL}${urlPathWithQuery}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization
    },
    body: bodyText ? bodyText : undefined
  });

  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!res.ok) {
    const error = new Error(data?.message || data?.detail || `WECHAT_API_ERROR:${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function generateOutTradeNo(prefix = "wx") {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
  return `${prefix}${ts}${randomString(10)}`.slice(0, 32);
}

export async function createWechatNativeOrder({ description, outTradeNo, totalFen, attach }, cfg) {
  const payload = {
    appid: cfg.appid,
    mchid: cfg.mchid,
    description,
    out_trade_no: outTradeNo,
    notify_url: cfg.notifyUrl,
    amount: { total: totalFen, currency: "CNY" },
    attach: attach || undefined
  };
  return wechatRequest("POST", "/v3/pay/transactions/native", payload, cfg);
}

export async function queryWechatOrder(outTradeNo, cfg) {
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(cfg.mchid)}`;
  return wechatRequest("GET", path, null, cfg);
}

export function decryptWechatResource({ apiV3Key, associated_data, nonce, ciphertext }) {
  const key = Buffer.from(String(apiV3Key), "utf8");
  const buf = Buffer.from(String(ciphertext), "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(String(nonce), "utf8"));
  decipher.setAAD(Buffer.from(String(associated_data || ""), "utf8"));
  decipher.setAuthTag(tag);
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(decoded);
}

let cachedCerts = null;
let cachedCertsAt = 0;

function parseCertsResponse(apiV3Key, items = []) {
  const map = new Map();
  items.forEach((item) => {
    const serial = item?.serial_no;
    const enc = item?.encrypt_certificate;
    if (!serial || !enc?.ciphertext || !enc?.nonce) return;
    try {
      const cert = decryptWechatResource({
        apiV3Key,
        associated_data: enc.associated_data || "",
        nonce: enc.nonce,
        ciphertext: enc.ciphertext
      });
      const pem = String(cert?.certificate || "");
      if (pem.includes("BEGIN CERTIFICATE")) {
        map.set(serial, pem);
      }
    } catch (_error) {
      void _error;
    }
  });
  return map;
}

async function getPlatformCertificates(cfg) {
  const now = Date.now();
  if (cachedCerts && now - cachedCertsAt < 10 * 60 * 1000) return cachedCerts;
  const res = await wechatRequest("GET", "/v3/certificates", null, cfg);
  const map = parseCertsResponse(cfg.apiV3Key, res?.data || []);
  cachedCerts = map;
  cachedCertsAt = now;
  return map;
}

export async function verifyWechatNotifySignature({ headers, body }, cfg) {
  const timestamp = headers["wechatpay-timestamp"];
  const nonce = headers["wechatpay-nonce"];
  const signature = headers["wechatpay-signature"];
  const serial = headers["wechatpay-serial"];
  if (!timestamp || !nonce || !signature || !serial) return false;

  const certs = await getPlatformCertificates(cfg);
  let pem = certs.get(serial);
  if (!pem) {
    cachedCerts = null;
    cachedCertsAt = 0;
    const refreshed = await getPlatformCertificates(cfg);
    pem = refreshed.get(serial);
  }
  if (!pem) return false;

  const message = `${timestamp}\n${nonce}\n${body}\n`;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(message);
  verifier.end();
  return verifier.verify(pem, signature, "base64");
}
