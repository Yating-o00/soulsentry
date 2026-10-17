import React from "react";
import { Smartphone, Monitor, Tablet, Watch, Speaker, Laptop } from "lucide-react";

// 品牌 SVG（24x24 viewBox，currentColor 填充，可被外层 color 着色）
const AppleLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M17.05 12.04c-.02-2.13 1.74-3.16 1.82-3.21-.99-1.45-2.54-1.65-3.09-1.67-1.31-.13-2.56.78-3.23.78-.67 0-1.7-.76-2.79-.74-1.44.02-2.76.84-3.5 2.13-1.5 2.6-.38 6.43 1.06 8.53.71 1.03 1.55 2.18 2.65 2.14 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.79.66 1.15-.02 1.88-1.05 2.59-2.08.82-1.19 1.15-2.35 1.17-2.41-.03-.01-2.24-.86-2.26-3.41zM15.13 5.4c.58-.71.97-1.69.86-2.66-.84.03-1.85.56-2.45 1.26-.54.63-1.01 1.63-.88 2.58.94.07 1.89-.47 2.47-1.18z"/>
  </svg>
);

const AndroidLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M17.6 9.48l1.84-3.18a.39.39 0 0 0-.14-.53.4.4 0 0 0-.54.14l-1.86 3.23a11.43 11.43 0 0 0-9.8 0L5.24 5.91a.4.4 0 0 0-.54-.14.39.39 0 0 0-.14.53l1.84 3.18A10.4 10.4 0 0 0 1 18h22a10.4 10.4 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 7 15.25zm10 0a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 17 15.25z"/>
  </svg>
);

const WindowsLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3 5.48L10.65 4.4v7.32H3V5.48zm0 13.04v-6.23h7.65v7.31L3 18.52zm8.55-13.85L21 3.3v8.43h-9.45V4.67zm0 14.66v-7.6H21V20.7l-9.45-1.37z"/>
  </svg>
);

const LinuxLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12.5 2c-2.43 0-4.4 2-4.4 4.46 0 .35.04.69.13 1.03-.36.45-.73 1.03-1.05 1.71-.79 1.71-1.36 4.2-1.4 6.95-.05.3-.18.62-.42 1.07-.34.64-.85 1.39-1.27 2.06-.42.66-.78 1.24-.85 1.78-.04.27.04.55.22.74.36.36.93.43 1.59.39 1.32-.07 3.06-.62 4.27-.69.43-.03.86.14 1.4.43.55.29 1.2.65 2.1.65.9 0 1.59-.36 2.18-.65.59-.29 1.07-.46 1.5-.43 1.21.07 2.95.62 4.27.69.66.04 1.23-.03 1.59-.39.18-.19.26-.47.22-.74-.07-.54-.43-1.12-.85-1.78-.42-.67-.93-1.42-1.27-2.06-.24-.45-.37-.77-.42-1.07-.04-2.75-.61-5.24-1.4-6.95-.32-.68-.69-1.26-1.05-1.71.09-.34.13-.68.13-1.03C16.9 4 14.93 2 12.5 2zm-1.6 4.7c.39 0 .7.37.7.83 0 .35-.18.65-.43.77a.31.31 0 0 1-.05-.16c0-.18-.18-.33-.4-.33-.22 0-.4.15-.4.33 0 .06.02.11.05.16-.25-.12-.43-.42-.43-.77 0-.46.31-.83.7-.83zm3.2 0c.39 0 .7.37.7.83 0 .35-.18.65-.43.77a.31.31 0 0 0 .05-.16c0-.18-.18-.33-.4-.33-.22 0-.4.15-.4.33 0 .06.02.11.05.16-.25-.12-.43-.42-.43-.77 0-.46.31-.83.7-.83z"/>
  </svg>
);

const ChromeLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.74 3.41L3.34 6.65A10 10 0 0 1 12 2zM2 12c0-1.81.48-3.5 1.34-4.95l3.92 6.78A5 5 0 0 0 12 17a5 5 0 0 0 1.36-.19l-3.92 6.78A10 10 0 0 1 2 12zm10 5a5 5 0 0 1-4.32-2.5L4.66 9.34A10 10 0 0 0 12 22a10 10 0 0 0 8.66-5H12zm10-5a10 10 0 0 1-1.34 4.95l-3.92-6.78A5 5 0 0 0 17 12a5 5 0 0 0-1-3h6.66A10 10 0 0 1 22 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
  </svg>
);

// 根据 device 推断图标 + 标签 + 颜色 + 真实设备形态
// 策略：UA / platform 字段优先于数据库里残留的 device_type,避免旧脏数据干扰。
// 返回的 deviceType 由 UA/平台实时判定,可直接用于 UI 类型展示。
export function resolveDeviceBrand(device) {
  const platform = (device.platform || "").toLowerCase();
  const ua = (device.user_agent || "").toLowerCase();
  const name = (device.name || "").toLowerCase();
  const dbType = device.device_type;

  // 名字里带明显形态提示(用户重命名或注册时打的标签)优先级最高
  // 例:"手机(iOS)" / "我的 iPhone" / "iPad Pro" / "工作电脑"
  let nameHint = null;
  if (/iphone|手机|phone(?!\s*os)/.test(name)) nameHint = "phone";
  else if (/ipad|平板|tablet/.test(name)) nameHint = "tablet";
  else if (/watch|手表/.test(name)) nameHint = "watch";
  else if (/speaker|音箱/.test(name)) nameHint = "speaker";
  else if (/mac|pc|电脑|笔记本|台式|desktop|laptop/.test(name)) nameHint = "pc";

  // 先用 UA 实时判定真实形态(忽略数据库 device_type 防止脏数据)
  let detectedType = dbType;
  if (ua.includes("iphone")) detectedType = "phone";
  else if (ua.includes("ipad")) detectedType = "tablet";
  else if (ua.includes("android")) detectedType = ua.includes("mobile") ? "phone" : "tablet";
  else if (ua.includes("watch")) detectedType = "watch";
  else if (platform.includes("ios") && !ua.includes("ipad")) detectedType = "phone";
  else if (platform.includes("mac") || platform.includes("win") || platform.includes("linux") || platform.includes("cros")) detectedType = "pc";

  // 名字提示和 UA 判定冲突时,以名字为准(更能反映用户认知里这是哪台设备)
  if (nameHint && nameHint !== detectedType) {
    detectedType = nameHint;
  }

  // 名字暗示是 iOS 设备但 platform 仍是 mac/win,清除掉冲突 platform/ua,避免下游标签显示错乱
  if (nameHint === "phone" && /ios|iphone/.test(name) && !ua.includes("iphone")) {
    return { Icon: AppleLogo, label: "iPhone", brandColor: "#0a0a0a", deviceType: "phone" };
  }
  if (nameHint === "tablet" && /ipad/.test(name) && !ua.includes("ipad")) {
    return { Icon: AppleLogo, label: "iPad", brandColor: "#0a0a0a", deviceType: "tablet" };
  }

  // 手表
  if (detectedType === "watch") {
    return { Icon: Watch, label: "手表", brandColor: "#384877", deviceType: "watch" };
  }
  // 音箱
  if (detectedType === "speaker") {
    return { Icon: Speaker, label: "音箱", brandColor: "#384877", deviceType: "speaker" };
  }
  // 平板
  if (detectedType === "tablet") {
    if (ua.includes("ipad") || platform.includes("ios")) {
      return { Icon: AppleLogo, label: "iPad", brandColor: "#0a0a0a", deviceType: "tablet" };
    }
    return { Icon: Tablet, label: "平板", brandColor: "#384877", deviceType: "tablet" };
  }
  // 手机
  if (detectedType === "phone") {
    if (platform.includes("ios") || ua.includes("iphone")) {
      return { Icon: AppleLogo, label: "iPhone", brandColor: "#0a0a0a", deviceType: "phone" };
    }
    if (platform.includes("android") || ua.includes("android")) {
      return { Icon: AndroidLogo, label: "Android", brandColor: "#10b981", deviceType: "phone" };
    }
    return { Icon: Smartphone, label: "手机", brandColor: "#384877", deviceType: "phone" };
  }
  // 电脑
  if (detectedType === "pc") {
    if (platform.includes("mac") || platform.includes("darwin")) {
      return { Icon: AppleLogo, label: "Mac", brandColor: "#374151", deviceType: "pc" };
    }
    if (platform.includes("win")) {
      return { Icon: WindowsLogo, label: "Windows", brandColor: "#2563eb", deviceType: "pc" };
    }
    if (platform.includes("linux")) {
      return { Icon: LinuxLogo, label: "Linux", brandColor: "#f59e0b", deviceType: "pc" };
    }
    if (platform.includes("cros")) {
      return { Icon: ChromeLogo, label: "Chrome OS", brandColor: "#2563eb", deviceType: "pc" };
    }
    return { Icon: Monitor, label: "电脑", brandColor: "#384877", deviceType: "pc" };
  }

  // 完全未知：用 UA 兜底
  if (ua.includes("iphone")) return { Icon: AppleLogo, label: "iPhone", brandColor: "#0a0a0a", deviceType: "phone" };
  if (ua.includes("android")) return { Icon: AndroidLogo, label: "Android", brandColor: "#10b981", deviceType: "phone" };
  if (platform.includes("mac")) return { Icon: AppleLogo, label: "Mac", brandColor: "#374151", deviceType: "pc" };
  if (platform.includes("win")) return { Icon: WindowsLogo, label: "Windows", brandColor: "#2563eb", deviceType: "pc" };
  return { Icon: Laptop, label: "设备", brandColor: "#384877", deviceType: "other" };
}