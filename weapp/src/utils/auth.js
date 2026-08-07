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
