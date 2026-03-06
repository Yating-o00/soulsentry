import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Cloud, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEVICE_META = {
  phone:   { icon: Smartphone, name: "智能手机", role: "主控终端",  gradient: "from-[#1e293b] to-[#384877]" },
  watch:   { icon: Watch,      name: "智能手表", role: "触觉提醒",  gradient: "from-[#334155] to-[#475569]" },
  glasses: { icon: Glasses,    name: "智能眼镜", role: "AR视觉",   gradient: "from-[#6366f1]/80 to-[#7c3aed]" },
  car:     { icon: Car,        name: "电动汽车", role: "车载系统",  gradient: "from-emerald-600 to-teal-700" },
  home:    { icon: Home,       name: "智能家居", role: "语音中枢",  gradient: "from-amber-500 to-orange-600" },
  pc:      { icon: Monitor,    name: "工作站",   role: "深度工作",  gradient: "from-rose-500 to-pink-600" },
};

const PRIORITY_STYLES = {
  high:   "bg-rose-50 text-rose-600 border-rose-200",
  medium: "bg-slate-100 text-slate-500 border-slate-200",
  low:    "bg-emerald-50 text-emerald-600 border-emerald-200",
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
          <h3 className="text-xl font-serif font-semibold text-[#0a0a0f] mb-1">全设备智能协同</h3>
          <p className="text-sm text-[#0a0a0f]/50">基于情境的分发策略</p>
        </div>
        <span className="px-3 py-1.5 bg-white/60 backdrop-blur border border-[#e8d5b7]/20 rounded-full text-xs text-[#0a0a0f]/60 flex items-center gap-1.5 shadow-sm">
          <Cloud className="w-3.5 h-3.5 text-emerald-500" />
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          云端同步正常
        </span>
      </div>

      {/* Device Grid - 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                "relative rounded-2xl p-5 text-center cursor-pointer border-2 transition-all duration-300",
                "bg-white/40 backdrop-blur-sm shadow-[0_2px_12px_rgba(0,0,0,0.03)]",
                "hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]",
                selected
                  ? "border-[#e8d5b7] bg-[#e8d5b7]/10 shadow-[0_0_0_3px_rgba(232,213,183,0.2),0_8px_24px_-8px_rgba(0,0,0,0.08)]"
                  : "border-transparent hover:border-[#e8d5b7]/30"
              )}
            >
              <div className={cn(
                "w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center shadow-lg text-white",
                `bg-gradient-to-br ${meta.gradient}`
              )}>
                <Icon className="w-6 h-6" />
              </div>
              <h4 className="font-medium text-[#0a0a0f] text-sm mb-0.5">{d.name || meta.name}</h4>
              <p className="text-[10px] text-[#0a0a0f]/40 uppercase tracking-wider mb-2">{meta.role}</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: hasStrategies ? 'rgba(16,185,129,0.1)' : 'rgba(10,10,15,0.05)' }}
              >
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
            className="bg-white/40 backdrop-blur-sm rounded-2xl p-6 border border-white/60 shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
          >
            {/* Panel Header */}
            <div className="flex justify-between items-start mb-5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shadow-md text-white",
                  `bg-gradient-to-br ${activeMeta.gradient}`
                )}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm text-[#0a0a0f]/50">本日策略 · {activeDevice.name || activeMeta.name}</div>
                  <h4 className="font-serif text-lg font-semibold text-[#0a0a0f]">{activeDevice.name || activeMeta.name} 策略</h4>
                </div>
              </div>
              <button className="px-3 py-1.5 text-xs border border-[#0a0a0f]/10 rounded-full hover:bg-[#0a0a0f]/5 transition-colors text-[#0a0a0f]/60">
                编辑优先级
              </button>
            </div>

            {/* Strategy Items */}
            <div className="space-y-3">
              {activeDevice.strategies.map((s, i) => {
                const time = formatTime(s.time);
                const priStyle = PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.medium;

                return (
                  <div
                    key={i}
                    className="flex items-start gap-4 p-4 bg-white/60 rounded-xl border border-white/80 hover:bg-white/80 transition-colors"
                  >
                    {/* Index circle */}
                    <div className="w-9 h-9 bg-[#e8d5b7]/20 rounded-full flex items-center justify-center text-[#0a0a0f]/60 text-sm font-serif flex-shrink-0">
                      {i + 1}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-[#0a0a0f] text-[15px]">{time}</span>
                      </div>
                      <p className="text-[#0a0a0f]/60 text-sm leading-relaxed">{s.content}</p>
                    </div>

                    {/* Method badge */}
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0",
                      priStyle
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

      {/* Empty state */}
      {activeDevice && (!activeDevice.strategies || activeDevice.strategies.length === 0) && (
        <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-8 border border-white/60 text-center">
          <p className="text-sm text-[#0a0a0f]/40">该设备暂无策略分配</p>
        </div>
      )}
    </section>
  );
}