import React from "react";
import { BUDDY_TINTS } from "@/lib/buddies";

// 呼吸搭子球 —— 心栈的「存在感」化身；每颗搭子有自己的色相（BUDDY_TINTS），
// 但同属品牌冷调色系。默认取学习搭子的品牌蓝色阶，避免两处色值失同步。
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const DEFAULT_TINT = BUDDY_TINTS.study;

function Orb({ size = 72, tint = DEFAULT_TINT }) {
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

export default React.memo(Orb);
