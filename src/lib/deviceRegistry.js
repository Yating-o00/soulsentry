import { base44 } from "@/api/base44Client";

const DEVICE_ID_KEY = "ss_device_id";
// 心跳频率：从 60s 降到 5 分钟，避免与其他后台请求叠加打爆 base44 rate limit。
// 在线判定窗口也对应放宽到 12 分钟。
const HEARTBEAT_INTERVAL = 5 * 60 * 1000;
const ONLINE_THRESHOLD_MS = 12 * 60 * 1000;

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
export function detectDeviceInfo() {
  const ua = navigator.userAgent || "";
  const lower = ua.toLowerCase();

  // iPadOS 13+ 默认伪装成 macOS Safari,需要用 touch points 判断
  const hasTouch = (navigator.maxTouchPoints || 0) > 1;
  const isIPadOS = /macintosh/i.test(ua) && hasTouch;
  // 小屏 + 触摸 = 移动设备(兜底:iPhone 在某些 WebView 也会伪装 UA)
  const isSmallTouchScreen =
    hasTouch && typeof window.screen?.width === "number" && Math.min(window.screen.width, window.screen.height) <= 500;

  let device_type = "pc";
  let role = "deep_work";
  let defaultName = "电脑";

  const isTablet =
    /ipad|tablet|playbook|silk/i.test(ua) ||
    isIPadOS ||
    (lower.includes("android") && !lower.includes("mobile"));
  const isPhone =
    /iphone|ipod|android.+mobile|windows phone|blackberry|bb10|mini|webos|opera mini/i.test(ua) ||
    isSmallTouchScreen;

  if (isPhone) {
    device_type = "phone";
    role = "primary";
    defaultName = "手机";
  } else if (isTablet) {
    device_type = "tablet";
    role = "secondary";
    defaultName = "平板";
  }

  // 平台:先按 UA 中的真实标识判断,再用启发式兜底
  let platform = "Unknown";
  if (/iphone|ipod/i.test(ua)) platform = "iOS";
  else if (isIPadOS || /ipad/i.test(ua)) platform = "iPadOS";
  else if (/android/i.test(ua)) platform = "Android";
  else if (/windows/i.test(ua)) platform = "Windows";
  else if (/linux/i.test(ua) && !/android/i.test(ua)) platform = "Linux";
  else if (/mac os x/i.test(ua)) {
    // macOS UA 若同时是手机(小触屏)说明是 iOS WebView 伪装,纠正为 iOS
    platform = isPhone ? "iOS" : "macOS";
  }
  // 兜底:小触屏但 UA 完全未知,标为 iOS(最常见 WebView 场景)
  else if (isSmallTouchScreen) platform = "iOS";

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
    // 如果旧记录的 device_type 与新检测不一致(例如之前误判为电脑,现在识别出是手机),
    // 自动修正名称为新类型的默认名;用户已手动改过的非默认名则保留
    const oldDefaults = ["电脑", "手机", "平板", "手表", "音箱", "其他"];
    const isUntouchedName =
      !dev.name ||
      oldDefaults.some((d) => dev.name === d || dev.name.startsWith(`${d}(`) || dev.name.startsWith(`${d}(`));
    const finalPayload =
      dev.device_type !== info.device_type && isUntouchedName
        ? { ...payload, name: info.defaultName }
        : payload;
    await base44.entities.Device.update(dev.id, finalPayload);
    return { ...dev, ...finalPayload };
  }
  const created = await base44.entities.Device.create({
    ...payload,
    name: info.defaultName,
  });
  return created;
}

/** 单次心跳：把 last_seen_at 推到最新；若检测到设备类型/平台与旧记录不一致则一并纠正 */
export async function heartbeat() {
  const device_id = getOrCreateDeviceId();
  const existing = await base44.entities.Device.filter({ device_id });
  if (!existing || existing.length === 0) {
    return registerCurrentDevice();
  }
  const dev = existing[0];
  const info = detectDeviceInfo();
  const patch = {
    is_online: true,
    last_seen_at: new Date().toISOString(),
  };
  // 如果旧记录的核心硬件标识与当前检测不一致(例如之前误判为电脑/macOS,现在识别出是手机/iOS),自动纠正
  if (
    dev.device_type !== info.device_type ||
    dev.platform !== info.platform ||
    dev.browser !== info.browser
  ) {
    patch.device_type = info.device_type;
    patch.role = info.role;
    patch.platform = info.platform;
    patch.browser = info.browser;
    patch.user_agent = info.user_agent;
    patch.screen_size = info.screen_size;
    patch.capabilities = info.capabilities;

    // 若 name 仍是旧默认名(电脑/Mac 等),同步更新为新形态默认名
    const oldDefaults = ["电脑", "手机", "平板", "手表", "音箱", "其他", "设备"];
    const isUntouchedName =
      !dev.name ||
      oldDefaults.some(
        (d) => dev.name === d || dev.name.startsWith(`${d}(`) || dev.name.startsWith(`${d}（`)
      );
    if (isUntouchedName) patch.name = info.defaultName;
  }
  try {
    await base44.entities.Device.update(dev.id, patch);
  } catch (e) {
    // 404 = 这条 Device 已被别处去重删掉，重新注册一台干净的，避免一直 404 刷屏
    if (e?.response?.status === 404 || /not found/i.test(e?.message || "")) {
      return registerCurrentDevice();
    }
    throw e;
  }
  return { ...dev, ...patch };
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

/**
 * 同一台真实设备去重：按 platform + browser + screen_size + device_type 作为硬件指纹合并
 * 保留 last_seen_at 最新的一条，其余作为重复记录清理掉
 */
async function dedupeDevices(list) {
  if (!Array.isArray(list) || list.length <= 1) return list;

  const groups = new Map();
  for (const d of list) {
    const key = [
      d.device_type || "?",
      d.platform || "?",
      d.browser || "?",
      d.screen_size || "?",
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  const survivors = [];
  const toDelete = [];

  for (const arr of groups.values()) {
    if (arr.length === 1) {
      survivors.push(arr[0]);
      continue;
    }
    // 按 last_seen_at 倒序，最新的留下
    arr.sort((a, b) => {
      const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return tb - ta;
    });
    survivors.push(arr[0]);
    for (let i = 1; i < arr.length; i++) toDelete.push(arr[i].id);
  }

  // 异步清理重复记录，不阻塞主流程
  if (toDelete.length > 0) {
    Promise.all(
      toDelete.map((id) => base44.entities.Device.delete(id).catch(() => null))
    ).catch(() => {});
  }

  return survivors;
}

/** 拉取当前用户所有设备，并按"最近心跳"判定在线状态。
 *  对"当前设备"用本地实时检测结果覆盖核心字段(device_type/platform/browser/user_agent),
 *  避免数据库中还未来得及更新的旧值(如旧记录里的电脑/macOS)被错误地渲染出来。
 */
export async function listMyDevices() {
  const list = await base44.entities.Device.list("-last_seen_at", 50);
  const deduped = await dedupeDevices(list || []);
  const now = Date.now();
  const currentId = getOrCreateDeviceId();
  const localInfo = detectDeviceInfo();
  return deduped.map((d) => {
    const t = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
    const online = now - t < ONLINE_THRESHOLD_MS;
    const isCurrent = d.device_id === currentId;
    if (isCurrent) {
      return {
        ...d,
        device_type: localInfo.device_type,
        platform: localInfo.platform,
        browser: localInfo.browser,
        user_agent: localInfo.user_agent,
        screen_size: localInfo.screen_size || d.screen_size,
        is_online: true,
        is_current: true,
      };
    }
    return { ...d, is_online: online, is_current: false };
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