import { useEffect } from "react";
import { startDeviceHeartbeat } from "@/lib/deviceRegistry";
import { base44 } from "@/api/base44Client";

/**
 * 全局挂载点：自动登记本机为一台真实设备，并维持心跳
 * 只在用户已登录时启动
 */
export default function DeviceHeartbeat() {
  useEffect(() => {
    let cleanup = null;
    let cancelled = false;

    Promise.resolve(base44.auth.isAuthenticated())
      .then((authed) => {
        if (cancelled || !authed) return;
        cleanup = startDeviceHeartbeat();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, []);

  return null;
}
