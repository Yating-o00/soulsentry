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
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-3xl overflow-hidden border border-slate-100 bg-white shadow-[0_2px_20px_rgba(0,0,0,0.04)]"
          >
            {/* Panel Header - with device accent color */}
            <div className={cn("px-6 py-5 flex items-center justify-between", activeMeta.bg)}>
              <div className="flex items-center gap-3.5">
                <div className={cn(
                  "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-md",
                  activeMeta.gradient
                )}>
                  {(() => { const Icon = activeMeta.icon; return <Icon className="w-5 h-5" />; })()}
                </div>
                <div>
                  <h4 className="text-base font-bold text-[#0a0a0f] leading-tight">
                    {activeDevice.name || activeMeta.name}
                  </h4>
                  <p className="text-xs text-[#0a0a0f]/45 mt-0.5">{activeMeta.role} · {activeDevice.strategies.length} 条策略</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] text-emerald-600 font-medium">已就绪</span>
                </span>
              </div>
            </div>

            {/* Strategy Timeline */}
            <div className="px-6 py-4">
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[19px] top-6 bottom-6 w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />

                <div className="space-y-1">
                  {activeDevice.strategies.map((s, i) => {
                    const time = formatTime(s.time);
                    const priorityCfg = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG.medium;
                    const isLast = i === activeDevice.strategies.length - 1;

                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.3 }}
                        className="group relative pl-12 py-3.5 rounded-2xl hover:bg-slate-50/80 transition-colors cursor-default"
                      >
                        {/* Timeline dot */}
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                          <div className={cn(
                            "w-3.5 h-3.5 rounded-full border-[2.5px] border-white ring-1 transition-all duration-300",
                            s.priority === 'high' ? "bg-rose-500 ring-rose-200" :
                            s.priority === 'medium' ? "bg-amber-500 ring-amber-200" :
                            "bg-slate-400 ring-slate-200"
                          )} />
                        </div>

                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Time label as scene-style tag */}
                            <div className="flex items-center gap-2.5 mb-1.5">
                              <span className="text-[13px] font-bold text-[#0a0a0f] tracking-tight">{time}</span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider",
                                priorityCfg.badge
                              )}>
                                {priorityCfg.label}
                              </span>
                            </div>
                            {/* Content */}
                            <p className="text-sm text-[#0a0a0f]/60 leading-relaxed">{s.content}</p>
                          </div>

                          {/* Method badge - pill style */}
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a0a0f]/[0.03] rounded-xl border border-[#0a0a0f]/[0.06] shrink-0 mt-0.5 group-hover:bg-[#0a0a0f]/[0.06] transition-colors">
                            <Zap className="w-3 h-3 text-[#0a0a0f]/40" />
                            <span className="text-xs font-medium text-[#0a0a0f]/60">{s.method}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty */}
      {activeDevice && (!activeDevice.strategies || activeDevice.strategies.length === 0) && (
        <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-slate-300" />
          </div>
          <p className="text-sm text-[#0a0a0f]/40">该设备暂无策略分配</p>
          <p className="text-xs text-[#0a0a0f]/25 mt-1">输入新安排后将自动分发</p>
        </div>
      )}
    </section>
  );
}