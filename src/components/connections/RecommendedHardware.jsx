import React from "react";
import { Watch, Speaker, Tablet, Monitor } from "lucide-react";

const RECS = [
  { icon: Watch, name: "智能手表", why: "抬腕即见提醒，紧急约定不会错过", how: "在手表浏览器打开心栈并登录，或在「我的」开启手表模式" },
  { icon: Speaker, name: "智能音箱", why: "早晨语音播报今日约定", how: "用音箱自带浏览器打开心栈，或绑定手机后通过语音助手转发" },
  { icon: Tablet, name: "平板", why: "作为桌面副屏展示日程看板", how: "用平板打开心栈并登录同一账号，自动出现在已连接设备中" },
  { icon: Monitor, name: "电脑", why: "处理需要深度工作的约定", how: "在电脑浏览器登录心栈，可安装为桌面应用" },
];

export default function RecommendedHardware({ connectedTypes = [] }) {
  const recs = RECS.filter((r) => !connectedTypes.includes(r.name));
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {recs.map((r) => (
        <div key={r.name} className="p-4 rounded-2xl border border-dashed border-slate-300 bg-white/60">
          <div className="flex items-center gap-2 mb-2">
            <r.icon className="w-4 h-4 text-[#384877]" />
            <p className="font-semibold text-slate-800 text-sm">推荐连接 · {r.name}</p>
          </div>
          <p className="text-xs text-slate-600">{r.why}</p>
          <p className="text-[11px] text-slate-400 mt-2">怎么连：{r.how}</p>
        </div>
      ))}
    </div>
  );
}