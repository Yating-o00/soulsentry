import { standaloneApiBaseUrl } from "./platformConfig";

const ACCESS_TOKEN_KEY = "soulsentry_access_token";

export function getAccessToken() {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch (_error) {
    return null;
  }
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
}

export async function httpRequest(path, { method = "GET", body, headers = {} } = {}) {
  const token = getAccessToken();
  const response = await fetch(`${standaloneApiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
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
