import { env } from "../config/env.js";

let cachedToken = null;
let cachedExpiresAt = 0;

function isConfigured() {
  return Boolean(env.WECHAT_APPID && env.WECHAT_APP_SECRET);
}

export async function getWechatAccessToken() {
  if (!isConfigured()) {
    return { token: null, error: "wechat_not_configured" };
  }

  const now = Date.now();
  if (cachedToken && cachedExpiresAt > now + 60 * 1000) {
    return { token: cachedToken, error: null };
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
    env.WECHAT_APPID
  )}&secret=${encodeURIComponent(env.WECHAT_APP_SECRET)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.errcode) {
      const error = new Error(data.errmsg || `wechat_token_err_${data.errcode}`);
      error.code = data.errcode;
      throw error;
    }

    cachedToken = data.access_token;
    // expires_in 单位为秒，留 5 分钟缓冲
    cachedExpiresAt = now + (data.expires_in || 7200) * 1000 - 5 * 60 * 1000;
    return { token: cachedToken, error: null };
  } catch (err) {
    console.error("[wechatAccessToken] failed:", err?.message || err);
    return { token: null, error: err?.message || "wechat_token_failed" };
  }
}

export async function code2Session(code) {
  if (!isConfigured() || !code) {
    return { error: "wechat_not_configured" };
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(
    env.WECHAT_APPID
  )}&secret=${encodeURIComponent(env.WECHAT_APP_SECRET)}&js_code=${encodeURIComponent(
    code
  )}&grant_type=authorization_code`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.errcode) {
      const error = new Error(data.errmsg || `wechat_code_err_${data.errcode}`);
      error.code = data.errcode;
      throw error;
    }

    return {
      openid: data.openid || null,
      unionid: data.unionid || null,
      sessionKey: data.session_key || null,
      error: null
    };
  } catch (err) {
    console.error("[wechatAccessToken] code2Session failed:", err?.message || err);
    return { openid: null, unionid: null, sessionKey: null, error: err?.message || "wechat_code_failed" };
  }
}
