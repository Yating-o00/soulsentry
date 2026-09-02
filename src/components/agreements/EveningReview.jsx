import React from "react";
import { Moon } from "lucide-react";

// 晚间 60 秒复盘：以「你已经做得很好了」收尾
export default function EveningReview({ completedToday = 0, pending = 0, streak = 0 }) {
  const hour = new Date().getHours();
  if (hour < 20) return null;

  return (
    <div className="rounded-2xl bg-[#384877] text-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <Moon className="w-4 h-4 text-white/80" />
        <p className="text-sm font-semibold">60 秒复盘</p>
      </div>
      <ul className="space-y-1 text-xs text-white/85 leading-relaxed">
        <li>今天如约完成 {completedToday} 件</li>
        <li>还有 {pending} 件在等你，明天再说也没关系</li>
        {streak > 0 && <li>连续如约已经 {streak} 天</li>}
      </ul>
      <p className="text-xs text-white mt-3 font-medium">你已经做得很好了。</p>
    </div>
  );
}