import { base44 } from "@/api/base44Client";

const DEVICE_ID_KEY = "ss_device_id";
const HEARTBEAT_INTERVAL = 60 * 1000; // 60s 心跳
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 分钟无心跳 = 离线

/** 生成或读取本机稳定指纹 */
function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev_${Date.now()}`;
  }
}

/** UA 识别设备类型 */
function detectDeviceInfo() {
  const ua = navigator.userAgent || "";
  const lower = ua.toLowerCase();

  let device_type = "pc";
  let role = "deep_work";
  let defaultName = "电脑";

  const isTablet = /ipad|tablet|playbook|silk/i.test(ua) || (lower.includes("android") && !lower.includes("mobile"));
  const isPhone = /iphone|ipod|android.+mobile|windows phone|blackberry|bb10|mini|webos|opera mini/i.test(ua);

  if (isTablet) {
    device_type = "tablet";
    role = "secondary";
    defaultName = "平板";
  } else if (isPhone) {
    device_type = "phone";
    role = "primary";
    defaultName = "手机";
  }

  // 平台
  let platform = "Unknown";
  if (/iphone|ipad|ipod/i.test(ua)) platform = "iOS";
  else if (/android/i.test(ua)) platform = "Android";
  else if (/mac os x/i.test(ua)) platform = "macOS";
  else if (/windows/i.test(ua)) platform = "Windows";
  else if (/linux/i.test(ua)) platform = "Linux";

  // 浏览器
  let browser = "Unknown";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
  else if (/firefox\//i.test(ua)) browser = "Firefox";

  // 能力检测
  const capabilities = [];
  if ("Notification" in window) capabilities.push("notification");
  if ("serviceWorker" in navigator && "PushManager" in window) capabilities.push("push");
  if ("geolocation" in navigator) capabilities.push("geolocation");
  if (navigator.mediaDevices) capabilities.push("media");

  const screen_size =
    typeof window.screen?.width === "number"
      ? `${window.screen.width}x${window.screen.height}`
      : "";

  return {
    device_type,
    role,
    defaultName: `${defaultName}（${platform}）`,
    platform,
    browser,
    user_agent: ua,
    screen_size,
    capabilities,
  };
}

/** 把本机注册/更新到后端 Device 实体 */
export async function registerCurrentDevice() {
  const device_id = getOrCreateDeviceId();
  const info = detectDeviceInfo();
  const now = new Date().toISOString();

  const existing = await base44.entities.Device.filter({ device_id });
  const payload = {
    device_id,
    device_type: info.device_type,
    role: info.role,
    platform: info.platform,
    browser: info.browser,
    user_agent: info.user_agent,
    screen_size: info.screen_size,
    capabilities: info.capabilities,
    is_online: true,
    last_seen_at: now,
  };

  if (existing && existing.length > 0) {
    const dev = existing[0];
    await base44.entities.Device.update(dev.id, payload);
    return { ...dev, ...payload };
  }
  const created = await base44.entities.Device.create({
    ...payload,
    name: info.defaultName,
  });
  return created;
}

/** 单次心跳：把 last_seen_at 推到最新 */
export async function heartbeat() {
  const device_id = getOrCreateDeviceId();
  const existing = await base44.entities.Device.filter({ device_id });
  if (!existing || existing.length === 0) {
    return registerCurrentDevice();
  }
  const dev = existing[0];
  await base44.entities.Device.update(dev.id, {
    is_online: true,
    last_seen_at: new Date().toISOString(),
  });
  return dev;
}

/** 标记本机离线（页面隐藏/关闭时调用） */
export async function markOffline() {
  try {
    const device_id = getOrCreateDeviceId();
    const existing = await base44.entities.Device.filter({ device_id });
    if (existing && existing[0]) {
      await base44.entities.Device.update(existing[0].id, { is_online: false });
    }
  } catch {
    // ignore
  }
}

/** 拉取当前用户所有设备，并按"最近心跳"判定在线状态 */
export async function listMyDevices() {
  const list = await base44.entities.Device.list("-last_seen_at", 50);
  const now = Date.now();
  const currentId = getOrCreateDeviceId();
  return (list || []).map((d) => {
    const t = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
    const online = now - t < ONLINE_THRESHOLD_MS;
    return { ...d, is_online: online, is_current: d.device_id === currentId };
  });
}

/** 启动心跳循环；返回 cleanup 函数 */
export function startDeviceHeartbeat() {
  let timer = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      await heartbeat();
    } catch {
      // ignore network errors silently
    }
  };

  // 首次立即注册
  registerCurrentDevice().catch(() => {});

  timer = setInterval(tick, HEARTBEAT_INTERVAL);

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      tick();
    } else {
      markOffline();
    }
  };
  const onBeforeUnload = () => markOffline();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}

export { getOrCreateDeviceId };