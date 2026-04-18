import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Cloud, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const devices = [
  { key: "phone", name: "手机", icon: Smartphone, online: true, role: "主控终端", color: "from-[#384877] to-[#3b5aa2]" },
  { key: "watch", name: "手表", icon: Watch, online: true, role: "触觉提醒", color: "from-[#3b5aa2] to-[#5b7bd6]" },
  { key: "glasses", name: "眼镜", icon: Glasses, online: false, role: "AR视觉", color: "from-violet-500 to-purple-600" },
  { key: "car", name: "汽车", icon: Car, online: true, role: "车载系统", color: "from-emerald-500 to-teal-600" },
  { key: "home", name: "家居", icon: Home, online: true, role: "语音中枢", color: "from-amber-500 to-orange-500" },
  { key: "pc", name: "工作站", icon: Monitor, online: true, role: "深度工作", color: "from-rose-500 to-pink-600" },
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg md:text-xl font-bold text-slate-800">全设备智能协同</h3>
          <p className="text-xs text-slate-400 mt-0.5">基于情境的分发策略</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-xs text-emerald-600 font-medium">
          <Cloud className="w-3.5 h-3.5" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          云端同步正常
        </span>
      </div>

      {/* Devices Horizontal Scroll on mobile, Grid on desktop */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide md:grid md:grid-cols-6 md:gap-3 md:overflow-visible md:pb-0">
        {devices.map((d) => {
          const Icon = d.icon;
          const isSelected = selected === d.key;
          return (
            <motion.button
              key={d.key}
              type="button"
              onClick={() => setSelected(d.key)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex-shrink-0 w-[88px] md:w-auto flex flex-col items-center gap-2 p-3 md:p-4 rounded-2xl transition-all duration-300 border-2 relative",
                isSelected
                  ? "bg-white border-[#384877] shadow-lg shadow-[#384877]/10"
                  : "bg-white/60 border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm"
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  "w-11 h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm",
                  isSelected
                    ? `bg-gradient-to-br ${d.color} text-white shadow-md`
                    : "bg-slate-100 text-slate-500"
                )}
              >
                <Icon className="w-5 h-5 md:w-[22px] md:h-[22px]" />
              </div>

              {/* Name */}
              <span className={cn(
                "text-xs font-semibold transition-colors",
                isSelected ? "text-slate-800" : "text-slate-600"
              )}>
                {d.name}
              </span>

              {/* Role */}
              <span className="text-[10px] text-slate-400 leading-tight text-center">
                {d.role}
              </span>

              {/* Status Dot */}
              <div className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                d.online ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  d.online ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                )} />
                {d.online ? "在线" : "待机"}
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <motion.div
                  layoutId="device-indicator"
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-[#384877]"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Strategy Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="mt-4 rounded-2xl p-4 bg-gradient-to-r from-slate-50 to-white border border-slate-100 shadow-sm flex items-center gap-3"
        >
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br text-white shadow-sm",
            devices.find(d => d.key === selected)?.color || "from-[#384877] to-[#3b5aa2]"
          )}>
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-400 mb-0.5 font-medium">
              {devices.find((d) => d.key === selected)?.name} · 本周策略
            </p>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              {strategyText[selected]}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}