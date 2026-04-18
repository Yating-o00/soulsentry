import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Cloud, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const devices = [
  { key: "phone", name: "智能手机", icon: Smartphone, online: true, role: "主控终端" },
  { key: "watch", name: "智能手表", icon: Watch, online: true, role: "触觉提醒" },
  { key: "glasses", name: "智能眼镜", icon: Glasses, online: false, role: "AR视觉" },
  { key: "car", name: "电动汽车", icon: Car, online: true, role: "车载系统" },
  { key: "home", name: "智能家居", icon: Home, online: true, role: "语音中枢" },
  { key: "pc", name: "工作站", icon: Monitor, online: true, role: "深度工作" },
];

const strategyText = {
  phone: "设置提醒，确保不错过任何会议和航班",
  watch: "以轻触与短振动传达紧急信息",
  glasses: "在路线与会议中叠加关键提示",
  car: "驾驶途中播报安排并自动导航",
  home: "早晚例行通过语音回顾与安排",
  pc: "专注时段集中处理长任务与文档",
};

export default function DeviceGridImageMode() {
  const [selected, setSelected] = useState("phone");

  return (
    <section className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h3 className="text-lg md:text-xl font-semibold text-slate-800 mb-0.5">全设备智能协同</h3>
          <p className="text-xs text-slate-500">基于情境的分发策略</p>
        </div>
        <div className="flex gap-2">
          <span className="px-2.5 py-1 glass-refined rounded-full text-xs text-slate-600 border border-slate-200 inline-flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5 text-emerald-600" />
            云端同步正常
          </span>
        </div>
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {devices.map((d) => {
          const Icon = d.icon;
          const isSelected = selected === d.key;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setSelected(d.key)}
              className={cn(
                "device-card glass-refined rounded-2xl p-5 text-center cursor-pointer transition-soul border-2 hover-lift",
                isSelected ? "border-[#3b5aa2] ring-1 ring-[#3b5aa2]/30" : "border-transparent"
              )}
            >
              <div
                className={cn(
                  "w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center text-slate-600 shadow-lg",
                  isSelected
                    ? "bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white"
                    : "bg-slate-100"
                )}
              >
                <Icon className="w-6 h-6" />
              </div>
              <h4 className="font-medium text-slate-800 text-sm mb-1">{d.name}</h4>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{d.role}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50">
                <div
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    d.online ? "bg-emerald-500" : "bg-slate-300"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    d.online ? "text-emerald-700" : "text-slate-500"
                  )}
                >
                  {d.online ? "在线" : "待机"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Strategy Card */}
      <div className="mt-4 md:mt-6 rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#384877] flex items-center justify-center shrink-0">
          <Zap className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 mb-1">
            本周策略 · {devices.find((d) => d.key === selected)?.name}
          </p>
          <p className="text-sm text-slate-700 font-medium leading-relaxed truncate">
            {strategyText[selected]}
          </p>
        </div>
      </div>
    </section>
  );
}