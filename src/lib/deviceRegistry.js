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
    // 用户手动改过名字的设备：绝不覆盖 name
    const isUntouchedName = !dev.name_customized;
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

    // 用户手动改过名字的设备：绝不覆盖 name
    if (!dev.name_customized) patch.name = info.defaultName;
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

/** 按稳定指纹 device_id 安全重命名：
 *  不依赖 UI 里可能已被去重删除的旧 id，而是用 device_id 重新查出当前存活记录再写入。
 *  若该指纹下有多条（去重前），全部写上同样的名字，避免下一次去重后名字丢失。
 */
export async function renameDeviceByFingerprint(deviceId, newName) {
  const existing = await base44.entities.Device.filter({ device_id: deviceId });
  if (!existing || existing.length === 0) {
    throw new Error("设备记录不存在，请刷新后重试");
  }
  await Promise.all(
    existing.map((d) =>
      base44.entities.Device.update(d.id, { name: newName, name_customized: true }).catch(() => null)
    )
  );
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
 * 同一台真实设备去重：仅按稳定指纹 device_id 合并同一台设备的多条记录，
 * 保留 last_seen_at 最新的一条，其余作为重复记录清理掉。
 * 注意：绝不按 platform/browser/screen_size 这类硬件特征跨 device_id 合并，
 * 否则两台同型号设备（如两台同分辨率 Windows）会被误删，重命名后刷新就丢失。
 */
async function dedupeDevices(list) {
  if (!Array.isArray(list) || list.length <= 1) return list;

  const groups = new Map();
  for (const d of list) {
    // 只用 device_id 作为去重键，确保不同物理设备永不互相合并
    const key = d.device_id || `__no_id_${d.id}`;
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
    // 优先保留用户改过名的记录，其次按 last_seen_at 倒序（最新的留下）
    arr.sort((a, b) => {
      if (!!a.name_customized !== !!b.name_customized) {
        return a.name_customized ? -1 : 1;
      }
      const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return tb - ta;
    });
    // 把幸存者的自定义名同步给同组其它记录，避免删错或竞态导致名字丢失
    const winner = arr[0];
    if (winner.name_customized && winner.name) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].name !== winner.name) {
          base44.entities.Device.update(arr[i].id, {
            name: winner.name,
            name_customized: true,
          }).catch(() => null);
        }
      }
    }
    survivors.push(winner);
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

  // visibilitychange 节流：用户在标签页之间频繁切换时不要每次都打一次心跳，
  // 避免和其它后台轮询叠加触发 429。最多 5 分钟一次。
  let lastVisibleTick = 0;
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      const now = Date.now();
      if (now - lastVisibleTick > 5 * 60 * 1000) {
        lastVisibleTick = now;
        tick();
      }
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