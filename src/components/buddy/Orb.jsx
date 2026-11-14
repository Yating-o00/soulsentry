import React from "react";

// 呼吸搭子球 —— 心栈的「存在感」化身；每颗搭子有自己的色相（BUDDY_TINTS）
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const DEFAULT_TINT = ["#f5e9d4", "#dcc9a4", "#b59767"];

export default function Orb({ size = 72, tint = DEFAULT_TINT }) {
  const [light, mid, deep] = tint;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* 外层光晕 */}
      <div
        className="ss-orb-halo absolute rounded-full"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle, ${hexToRgba(mid, 0.55)} 0%, ${hexToRgba(mid, 0)} 70%)`,
        }}
      />
      {/* 主体 */}
      <div
        className="ss-orb-core rounded-full"
        style={{
          width: size * 0.62,
          height: size * 0.62,
          background: `radial-gradient(circle at 34% 30%, ${light} 0%, ${mid} 42%, ${deep} 100%)`,
          boxShadow: `inset -4px -6px 12px ${hexToRgba(deep, 0.28)}, 0 6px 16px ${hexToRgba(deep, 0.22)}`,
        }}
      />
    </div>
  );
}
