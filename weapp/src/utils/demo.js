import { post } from "./api";
import { getToken, setToken, setDemoMode } from "./auth";

const DEMO_EMAIL = "demo@soulsentry.local";
const DEMO_PASSWORD = "demo123456";

let pending = null;

// 未登录时静默进入 Demo 会话（使用后端常驻 demo 账号），
// 让用户不登录也能看到各板块的演示数据；登录后会被真实会话替换。
export function ensureDemoSession() {
  if (getToken()) return Promise.resolve();
  if (pending) return pending;
  pending = post("/auth/login", { type: "email", email: DEMO_EMAIL, password: DEMO_PASSWORD }, { silent: true })
    .then((data) => {
      if (data?.token) {
        setToken(data.token);
        setDemoMode(true);
      }
    })
    .catch(() => {
      // 静默失败（如离线）：保持游客态，下次进入重试
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
