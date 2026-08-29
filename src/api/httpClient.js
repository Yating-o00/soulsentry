import { standaloneApiBaseUrl } from "./platformConfig";

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
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined)
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `请求失败: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
