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

// 根据 device 推断图标 + 标签 + 颜色
// 策略：先按设备形态（手机/电脑/平板/手表/音箱）锁定图标轮廓，
// 再用平台/UA 细分（iPhone vs Android、Mac vs Windows 等）以表达品牌。
export function resolveDeviceBrand(device) {
  const platform = (device.platform || "").toLowerCase();
  const ua = (device.user_agent || "").toLowerCase();
  const type = device.device_type;

  // 手表：始终显示手表图标
  if (type === "watch") {
    return { Icon: Watch, label: "手表", brandColor: "#384877" };
  }
  // 音箱：始终显示音箱图标
  if (type === "speaker") {
    return { Icon: Speaker, label: "音箱", brandColor: "#384877" };
  }
  // 平板：iPad 用 Apple logo，其它用平板形态图标
  if (type === "tablet" || ua.includes("ipad")) {
    if (ua.includes("ipad") || platform.includes("ios")) {
      return { Icon: AppleLogo, label: "iPad", brandColor: "#0a0a0a" };
    }
    return { Icon: Tablet, label: "平板", brandColor: "#384877" };
  }
  // 手机：iPhone → Apple，Android → Android，其它 → 通用手机
  if (type === "phone") {
    if (platform.includes("ios") || ua.includes("iphone")) {
      return { Icon: AppleLogo, label: "iPhone", brandColor: "#0a0a0a" };
    }
    if (platform.includes("android") || ua.includes("android")) {
      return { Icon: AndroidLogo, label: "Android", brandColor: "#10b981" };
    }
    return { Icon: Smartphone, label: "手机", brandColor: "#384877" };
  }
  // 电脑：Mac → Apple，Windows → Windows，Linux → Linux，ChromeOS → Chrome
  if (type === "pc") {
    if (platform.includes("mac") || platform.includes("darwin")) {
      return { Icon: AppleLogo, label: "Mac", brandColor: "#374151" };
    }
    if (platform.includes("win")) {
      return { Icon: WindowsLogo, label: "Windows", brandColor: "#2563eb" };
    }
    if (platform.includes("linux")) {
      return { Icon: LinuxLogo, label: "Linux", brandColor: "#f59e0b" };
    }
    if (platform.includes("cros")) {
      return { Icon: ChromeLogo, label: "Chrome OS", brandColor: "#2563eb" };
    }
    return { Icon: Monitor, label: "电脑", brandColor: "#384877" };
  }

  // other 或未知：用 UA 兜底猜一次形态
  if (ua.includes("iphone")) return { Icon: AppleLogo, label: "iPhone", brandColor: "#0a0a0a" };
  if (ua.includes("android")) return { Icon: AndroidLogo, label: "Android", brandColor: "#10b981" };
  if (platform.includes("mac")) return { Icon: AppleLogo, label: "Mac", brandColor: "#374151" };
  if (platform.includes("win")) return { Icon: WindowsLogo, label: "Windows", brandColor: "#2563eb" };
  return { Icon: Laptop, label: "设备", brandColor: "#384877" };
}