import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Cloud, Zap, ChevronRight, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEVICE_META = {
  phone:   { icon: Smartphone, name: "智能手机", role: "主控终端",  gradient: "from-[#1e293b] to-[#384877]", accent: "#384877", bg: "bg-[#384877]/5" },
  watch:   { icon: Watch,      name: "智能手表", role: "触觉提醒",  gradient: "from-[#334155] to-[#475569]", accent: "#475569", bg: "bg-slate-500/5" },
  glasses: { icon: Glasses,    name: "智能眼镜", role: "AR视觉",   gradient: "from-[#6366f1]/80 to-[#7c3aed]", accent: "#6366f1", bg: "bg-indigo-500/5" },
  car:     { icon: Car,        name: "电动汽车", role: "车载系统",  gradient: "from-emerald-600 to-teal-700", accent: "#059669", bg: "bg-emerald-500/5" },
  home:    { icon: Home,       name: "智能家居", role: "语音中枢",  gradient: "from-amber-500 to-orange-600", accent: "#d97706", bg: "bg-amber-500/5" },
  pc:      { icon: Monitor,    name: "工作站",   role: "深度工作",  gradient: "from-rose-500 to-pink-600", accent: "#e11d48", bg: "bg-rose-500/5" },
};

const PRIORITY_CONFIG = {
  high:   { label: "高优先", dot: "bg-rose-500", badge: "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20", glow: "shadow-rose-500/10" },
  medium: { label: "中优先", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20", glow: "shadow-amber-500/10" },
  low:    { label: "低优先", dot: "bg-slate-400", badge: "bg-slate-400/10 text-slate-500 ring-1 ring-slate-400/20", glow: "shadow-slate-400/10" },
};

function formatTime(raw) {
  if (!raw) return "—";
  if (raw.includes("T")) return raw.split("T")[1]?.slice(0, 5) || raw;
  if (raw.match(/^\d{1,2}:\d{2}/)) return raw.slice(0, 5);
  return raw;
}

export default function DeviceStrategyMap({ devices = [] }) {
  const [active, setActive] = useState(devices?.[0]?.id || null);
  if (!devices || devices.length === 0) return null;

  const activeDevice = devices.find((d) => d.id === active);
  const activeMeta = DEVICE_META[active] || DEVICE_META.phone;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[#0a0a0f] mb-0.5">全设备智能协同</h3>
          <p className="text-sm text-[#0a0a0f]/50">基于情境的分发策略</p>
        </div>
        <span className="px-3 py-1.5 glass-refined rounded-full text-xs text-[#0a0a0f]/60 flex items-center gap-1.5 border border-[#e8d5b7]/20">
          <Cloud className="w-3.5 h-3.5 text-emerald-500" />
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          云端同步正常
        </span>
      </div>

      {/* Device Grid - 2x3 on mobile, 3 cols md, 6 cols lg */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {devices.map((d) => {
          const meta = DEVICE_META[d.id] || DEVICE_META.phone;
          const Icon = meta.icon;
          const selected = active === d.id;
          const hasStrategies = d.strategies && d.strategies.length > 0;

          return (
            <button
              key={d.id}
              onClick={() => setActive(d.id)}
              className={cn(
                "glass-refined rounded-2xl p-5 text-center cursor-pointer border-2 transition-all duration-500",
                "hover:-translate-y-1 hover:shadow-[0_12px_30px_-10px_rgba(10,10,15,0.1)]",
                selected
                  ? "device-active"
                  : "border-transparent"
              )}
            >
              {/* Icon - selected: dark gradient, unselected: light gray circle */}
              <div className={cn(
                "w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500",
                selected
                  ? `bg-gradient-to-br ${meta.gradient} text-white`
                  : "bg-slate-100 text-slate-500"
              )}>
                <Icon className="w-6 h-6" />
              </div>
              <h4 className="font-medium text-[#0a0a0f] text-sm mb-0.5">{d.name || meta.name}</h4>
              <p className="text-[10px] text-[#0a0a0f]/40 uppercase tracking-wider mb-3">{meta.role}</p>
              {/* Online status */}
              <div className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                hasStrategies ? "bg-emerald-500/10" : "bg-[#0a0a0f]/5"
              )}>
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  hasStrategies ? "bg-emerald-500 animate-pulse" : "bg-[#0a0a0f]/30"
                )} />
                <span className={cn(
                  "text-[10px] font-medium",
                  hasStrategies ? "text-emerald-600" : "text-[#0a0a0f]/50"
                )}>
                  {hasStrategies ? "在线" : "待机"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Device Detail Panel */}
      <AnimatePresence mode="wait">
        {activeDevice && activeDevice.strategies?.length > 0 && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="glass-refined rounded-2xl p-6"
          >
            {/* Panel title */}
            <div className="flex justify-between items-start mb-5">
              <div>
                <h4 className="text-lg font-bold text-[#0a0a0f]">
                  {activeDevice.name || activeMeta.name} 策略
                </h4>
                <p className="text-sm text-[#0a0a0f]/50 mt-0.5">基于场景的智能分发</p>
              </div>
              <button className="px-3 py-1.5 text-xs border border-[#0a0a0f]/10 rounded-full hover:bg-[#0a0a0f]/5 transition-colors text-[#0a0a0f]/60">
                编辑优先级
              </button>
            </div>

            {/* Strategy items - card style with left colored border */}
            <div className="space-y-3">
              {activeDevice.strategies.map((s, i) => {
                const time = formatTime(s.time);
                const methodStyle = METHOD_STYLES[s.priority] || METHOD_STYLES.medium;
                // Left border color based on priority
                const leftBorder = s.priority === 'high'
                  ? "border-l-rose-400"
                  : s.priority === 'medium'
                    ? "border-l-blue-300"
                    : "border-l-slate-200";

                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-4 p-4 bg-white/50 rounded-xl border border-white/70 hover:bg-white/70 transition-colors",
                      "border-l-[3px]",
                      leftBorder
                    )}
                  >
                    {/* Number circle */}
                    <div className="w-8 h-8 bg-[#e8d5b7]/20 rounded-full flex items-center justify-center text-[#0a0a0f]/60 text-sm font-medium flex-shrink-0">
                      {i + 1}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-[#0a0a0f] text-[15px] leading-snug">{time}</span>
                      <p className="text-[#0a0a0f]/55 text-sm leading-relaxed mt-0.5">{s.content}</p>
                    </div>

                    {/* Method badge */}
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0",
                      methodStyle
                    )}>
                      {s.method}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty */}
      {activeDevice && (!activeDevice.strategies || activeDevice.strategies.length === 0) && (
        <div className="glass-refined rounded-2xl p-8 text-center">
          <p className="text-sm text-[#0a0a0f]/40">该设备暂无策略分配</p>
        </div>
      )}
    </section>
  );
}