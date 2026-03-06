import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Clock, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEVICE_CONFIG = {
  phone: { icon: Smartphone, gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100", shadow: "shadow-blue-500/20" },
  watch: { icon: Watch, gradient: "from-violet-500 to-purple-600", bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-100", shadow: "shadow-violet-500/20" },
  glasses: { icon: Glasses, gradient: "from-cyan-500 to-teal-600", bg: "bg-cyan-50", text: "text-cyan-600", border: "border-cyan-100", shadow: "shadow-cyan-500/20" },
  car: { icon: Car, gradient: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100", shadow: "shadow-amber-500/20" },
  home: { icon: Home, gradient: "from-emerald-500 to-green-600", bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100", shadow: "shadow-emerald-500/20" },
  pc: { icon: Monitor, gradient: "from-slate-500 to-slate-700", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", shadow: "shadow-slate-500/20" },
};

const PRIORITY_CONFIG = {
  high: { dot: "bg-rose-500", label: "紧急", bg: "bg-rose-50 text-rose-700 border-rose-200" },
  medium: { dot: "bg-amber-400", label: "中等", bg: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { dot: "bg-emerald-400", label: "普通", bg: "bg-emerald-50 text-emerald-600 border-emerald-200" },
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
  const cfg = DEVICE_CONFIG[active] || DEVICE_CONFIG.phone;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#5b6fbf] flex items-center justify-center shadow-md shadow-[#384877]/15">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">全设备智能协同</h4>
          <p className="text-[11px] text-slate-400">基于情境的一对一分发策略</p>
        </div>
      </div>

      {/* Device Selector - Horizontal scroll pills */}
      <div className="px-5 pb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {devices.map((d) => {
            const dc = DEVICE_CONFIG[d.id] || DEVICE_CONFIG.phone;
            const Icon = dc.icon;
            const selected = active === d.id;
            const count = d.strategies?.length || 0;

            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all duration-200 whitespace-nowrap shrink-0",
                  selected
                    ? `bg-gradient-to-r ${dc.gradient} text-white border-transparent shadow-lg ${dc.shadow}`
                    : "bg-slate-50 border-slate-150 text-slate-600 hover:bg-slate-100 hover:border-slate-200"
                )}
              >
                <Icon className={cn("w-4 h-4", selected ? "text-white/90" : dc.text)} />
                <span className="text-[13px] font-medium">{d.name || d.id}</span>
                <span className={cn(
                  "text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-md",
                  selected ? "bg-white/20 text-white" : "bg-white text-slate-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strategy List */}
      <AnimatePresence mode="wait">
        {activeDevice && activeDevice.strategies?.length > 0 && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="px-5 pb-5"
          >
            <div className="space-y-2">
              {activeDevice.strategies.map((s, i) => {
                const pri = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG.medium;
                const time = formatTime(s.time);

                return (
                  <div
                    key={i}
                    className={cn(
                      "group flex items-start gap-3 p-3 rounded-xl border transition-all",
                      "bg-white hover:bg-slate-50/60",
                      cfg.border
                    )}
                  >
                    {/* Time pill */}
                    <div className={cn(
                      "flex flex-col items-center min-w-[48px] py-1.5 px-2 rounded-lg",
                      cfg.bg
                    )}>
                      <Clock className={cn("w-3 h-3 mb-0.5 opacity-60", cfg.text)} />
                      <span className={cn("text-[11px] font-mono font-bold leading-tight", cfg.text)}>
                        {time}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[13px] font-semibold text-slate-800">{s.method}</span>
                        {s.priority && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                            pri.bg
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", pri.dot)} />
                            {pri.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{s.content}</p>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-200 shrink-0 mt-1 group-hover:text-slate-400 transition-colors" />
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty */}
      {activeDevice && (!activeDevice.strategies || activeDevice.strategies.length === 0) && (
        <div className="px-5 pb-5">
          <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-5 text-center">
            <p className="text-xs text-slate-400">该设备暂无策略分配</p>
          </div>
        </div>
      )}
    </section>
  );
}