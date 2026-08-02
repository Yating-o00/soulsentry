import { toast } from "sonner";

// 全局兜底：把偶发断网/超时导致的未捕获 Network Error 转成温和提示，
// 避免后台轮询(心跳/通知/围栏)在网络抖动时把原始错误抛给用户。
let lastToastAt = 0;
const TOAST_COOLDOWN_MS = 30000;

function isNetworkError(reason) {
  const msg = String(reason?.message || reason || "");
  return /network error|failed to fetch|load failed|networkerror|timeout of \d+ms/i.test(msg);
}

export function installNetworkErrorGuard() {
  window.addEventListener("unhandledrejection", (event) => {
    if (!isNetworkError(event.reason)) return;
    event.preventDefault();
    console.warn("[NetworkGuard] 已拦截网络错误:", event.reason?.message || event.reason);
    const now = Date.now();
    if (navigator.onLine !== false && now - lastToastAt > TOAST_COOLDOWN_MS) {
      lastToastAt = now;
      toast.warning("网络连接不稳定", {
        description: "部分数据可能暂时无法同步,网络恢复后会自动重试",
        duration: 4000,
      });
    }
  });
}