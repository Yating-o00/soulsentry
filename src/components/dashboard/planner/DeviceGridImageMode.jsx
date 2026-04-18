import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Cloud, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const devices = [
  { key: "phone", name: "手机", icon: Smartphone, online: true, role: "主控终端" },
  { key: "watch", name: "手表", icon: Watch, online: true, role: "触觉提醒" },
  { key: "glasses", name: "眼镜", icon: Glasses, online: false, role: "AR视觉" },
  { key: "car", name: "汽车", icon: Car, online: true, role: "车载系统" },
  { key: "home", name: "家居", icon: Home, online: true, role: "语音中枢" },
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

const GRADIENTS = {
  phone: "from-[#384877] to-[#3b5aa2]",
  watch: "from-[#3b5aa2] to-[#6366f1]",
  glasses: "from-[#6366f1] to-[#7c3aed]",
  car: "from-emerald-600 to-teal-700",
  home: "from-amber-500 to-orange-600",
  pc: "from-rose-500 to-pink-600",
};

export default function DeviceGridImageMode() {
  const [selected, setSelected] = useState("phone");

  return (
    <section className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-md">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">全设备智能协同</h3>
            <p className="text-xs text-slate-400">基于情境的分发策略</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-xs text-slate-500 border border-slate-200 shadow-sm">
          <Cloud className="w-3.5 h-3.5 text-emerald-500" />
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          云端同步正常
        </span>
      </div>

      {/* Devices Horizontal Scroll on mobile, Grid on desktop */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide md:grid md:grid-cols-3 lg:grid-cols-6 md:gap-3 md:overflow-visible md:pb-0">
        {devices.map((d) => {
          const Icon = d.icon;
          const isSelected = selected === d.key;
          const gradient = GRADIENTS[d.key] || GRADIENTS.phone;

          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setSelected(d.key)}
              className={cn(
                "flex-shrink-0 w-[100px] md:w-auto rounded-2xl p-3.5 md:p-4 text-center transition-all duration-300 border-2 bg-white",
                "hover:shadow-md hover:-translate-y-0.5",
                isSelected
                  ? "border-[#384877] shadow-md ring-2 ring-[#384877]/10"
                  : "border-slate-100 hover:border-slate-200"
              )}
            >
              <div className={cn(
                "w-11 h-11 mx-auto mb-2.5 rounded-xl flex items-center justify-center shadow-md transition-all duration-300",
                isSelected
                  ? `bg-gradient-to-br ${gradient} text-white`
                  : "bg-slate-100 text-slate-400"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-slate-800 text-sm whitespace-nowrap mb-0.5">{d.name}</h4>
              <p className="text-[10px] text-slate-400 whitespace-nowrap mb-2">{d.role}</p>
              <div className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap",
                d.online ? "bg-emerald-50" : "bg-slate-50"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  d.online ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                )} />
                <span className={cn(
                  "text-[10px] font-medium",
                  d.online ? "text-emerald-600" : "text-slate-400"
                )}>
                  {d.online ? "在线" : "待机"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Strategy Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="mt-4 rounded-2xl p-4 bg-white border border-slate-200 shadow-sm flex items-center gap-3"
        >
          <div className={cn(
            "w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-sm flex-shrink-0",
            GRADIENTS[selected] || GRADIENTS.phone
          )}>
            {(() => { const D = devices.find(d => d.key === selected); const Icon = D?.icon || Smartphone; return <Icon className="w-4 h-4" />; })()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 mb-0.5">
              {devices.find(d => d.key === selected)?.name} · 当前策略
            </p>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              {strategyText[selected]}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}