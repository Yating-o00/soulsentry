import Taro from "@tarojs/taro";

const TOKEN_KEY = "ss_token";

export function getToken() {
  return Taro.getStorageSync(TOKEN_KEY) || null;
}

export function setToken(token) {
  Taro.setStorageSync(TOKEN_KEY, token);
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

// Demo 模式：未登录时静默使用 demo 账号会话，让用户先逛起来
const DEMO_KEY = "ss_demo_mode";

export function setDemoMode(v) {
  if (v) Taro.setStorageSync(DEMO_KEY, "1");
  else Taro.removeStorageSync(DEMO_KEY);
}

export function isDemoMode() {
  return Taro.getStorageSync(DEMO_KEY) === "1";
}

const ACCOUNTS_KEY = "ss_accounts";
const ACCOUNTS_CAP = 5;

export function getAccounts() {
  const list = Taro.getStorageSync(ACCOUNTS_KEY);
  return Array.isArray(list) ? list : [];
}

// 记录/更新本机登录过的账户（含 token，用于一键切换），最多保留 5 个，最新在前
export function rememberAccount(account) {
  if (!account || !account.id) return;
  const rest = getAccounts().filter((a) => a.id !== account.id);
  const next = [
    {
      id: account.id,
      name: account.name || "",
      email: account.email || "",
      phone: account.phone || "",
      avatar: account.avatar || "",
      token: account.token || ""
    },
    ...rest
  ];
  Taro.setStorageSync(ACCOUNTS_KEY, next.slice(0, ACCOUNTS_CAP));
}
