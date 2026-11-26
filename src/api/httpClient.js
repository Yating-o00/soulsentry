import { getChatAiProvider, setChatAiProvider } from "./aiPreference";
import { standaloneApiBaseUrl } from "./platformConfig";
import { frontendVersionHeaders } from "../lib/releaseIdentity";

const ACCESS_TOKEN_KEY = "soulsentry_access_token";

function getCookieToken() {
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + ACCESS_TOKEN_KEY + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch (_error) {
    return null;
  }
}

function setCookieToken(token) {
  try {
    if (token) {
      document.cookie = `${ACCESS_TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch (_error) {
    // Ignore cookie failures.
  }
}

export function getAccessToken() {
  try {
    const ls = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (ls) return ls;
  } catch (_error) {
    // Fall through to cookie fallback.
  }
  return getCookieToken();
}

export function setAccessToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  } catch (_error) {
    // Ignore storage failures in privacy mode.
  }
  setCookieToken(token);
}

export function buildApiUrl(path) {
  return `${standaloneApiBaseUrl}${path}`;
}

export async function httpRequest(path, { method = "GET", body, headers = {} } = {}) {
  const token = getAccessToken();
  const chatProvider = method === "POST" && (["/api/companion/messages", "/api/chat"].includes(path) || /^\/api\/buddies\/[^/]+\/agent$/.test(path) || path === "/api/functions/analyzeHeartSign")
    ? getChatAiProvider() : "";
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(chatProvider ? { "X-Chat-AI-Provider": chatProvider } : {}),
      ...headers,
      ...frontendVersionHeaders()
    },
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined)
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_parseError) {
    // 网关 502/504 或 HTML 错误页统一转成用户能理解的提示，不把整段 HTML 弹给用户；
    // 具体原始内容仍放在 error.data 里，方便开发排查。
    const snippet = raw ? raw.slice(0, 120).replace(/\s+/g, " ") : "";
    const html = /^\s*</.test(raw);
    const gateway = [502, 503, 504].includes(response.status) || html;
    const error = new Error(gateway
      ? "服务正在重启或暂时不可用，请稍后重试"
      : `服务端返回非 JSON 响应（${response.status}）：${snippet}`);
    error.status = response.status;
    error.data = { raw, html, gateway };
    throw error;
  }

  // The experiment can be switched off while a browser still holds a choice.
  // The server rejects before processing the message, so retrying default is safe.
  if (response.status === 403 && data?.error === "AI_EXPERIMENT_DISABLED" && chatProvider && !headers["X-Chat-AI-Provider"]) {
    try { setChatAiProvider(""); } catch { /* Storage may be disabled. */ }
    return httpRequest(path, { method, body, headers: { ...headers, "X-Chat-AI-Provider": "" } });
  }

  if (!response.ok) {
    // 401 时清除本地 token：过期/失效凭证不应永久占位，
    // 清除后调用方（如 standalone 的 demo 自动登录）才能重新认证
    if (response.status === 401) {
      setAccessToken(null);
    }
    const error = new Error(data?.message || `请求失败: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
