import Taro from "@tarojs/taro";
import { getToken, clearToken } from "./auth";

const BASE_API = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";

function showError(message) {
  Taro.showToast({ title: message || "请求失败", icon: "none", duration: 2500 });
}

export function request(options = {}) {
  const { silent, ...rest } = options;
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(rest.header || {})
  };

  const url = rest.url.startsWith("http") ? rest.url : `${BASE_API}${rest.url}`;

  return Taro.request({
    ...rest,
    url,
    header: headers,
    timeout: rest.timeout || 60000
  })
    .then((res) => {
      const { statusCode, data } = res;

      if (statusCode >= 200 && statusCode < 300) {
        return data;
      }

      if (statusCode === 401) {
        clearToken();
        const pages = Taro.getCurrentPages();
        const currentPath = pages.length > 0 ? pages[pages.length - 1].route : "";
        const isLoginPage = currentPath === "pages/login/index" || currentPath === "pages/index/index";

        if (!isLoginPage && !silent) {
          showError("登录已过期，请重新登录");
          setTimeout(() => {
            Taro.redirectTo({ url: "/pages/login/index" });
          }, 1500);
        }
        return Promise.reject(new Error("UNAUTHORIZED"));
      }

      const message = data?.message || data?.error || `请求失败 (${statusCode})`;
      if (!silent) showError(message);
      return Promise.reject(new Error(message));
    })
    .catch((err) => {
      if (silent) return Promise.reject(err);
      if (err?.errMsg && err.errMsg.includes("request:fail")) {
        showError("网络连接失败，请检查网络");
      } else if (err?.message === "UNAUTHORIZED") {
        // already handled
      } else {
        showError(err?.message || "请求异常");
      }
      return Promise.reject(err);
    });
}

export function get(url, params = {}, options = {}) {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  return request({
    method: "GET",
    url: query ? `${url}?${query}` : url,
    ...options
  });
}

export function post(url, data = {}, options = {}) {
  return request({ method: "POST", url, data, ...options });
}

export function patch(url, data = {}, options = {}) {
  return request({ method: "PATCH", url, data, ...options });
}

export function del(url, options = {}) {
  return request({ method: "DELETE", url, ...options });
}
