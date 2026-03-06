import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Clock, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEVICE_META = {
  phone: { icon: Smartphone, label: "手机", color: "from-blue-500 to-indigo-600", bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-200", border: "border-blue-200" },
  watch: { icon: Watch, label: "手表", color: "from-purple-500 to-fuchsia-600", bg: "bg-purple-50", text: "text-purple-600", ring: "ring-purple-200", border: "border-purple-200" },
  glasses: { icon: Glasses, label: "眼镜", color: "from-cyan-500 to-teal-600", bg: "bg-cyan-50", text: "text-cyan-600", ring: "ring-cyan-200", border: "border-cyan-200" },
  car: { icon: Car, label: "车", color: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-200", border: "border-amber-200" },
  home: { icon: Home, label: "家", color: "from-emerald-500 to-green-600", bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200", border: "border-emerald-200" },
  pc: { icon: Monitor, label: "电脑", color: "from-slate-500 to-slate-700", bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200", border: "border-slate-200" },
};

const PRIORITY_STYLES = {
  high: { dot: "bg-rose-500", label: "高", bg: "bg-rose-50 text-rose-700" },
  medium: { dot: "bg-amber-400", label: "中", bg: "bg-amber-50 text-amber-700" },
  low: { dot: "bg-slate-300", label: "低", bg: "bg-slate-50 text-slate-500" },
};

export default function DeviceStrategyMap({ devices = [] }) {
  const [active, setActive] = useState(devices?.[0]?.id || null);
  if (!devices || devices.length === 0) return null;

  const activeDevice = devices.find((x) => x.id === active);
  const meta = DEVICE_META[active] || DEVICE_META.phone;

  return (
    <section className="rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#384877] to-[#5b6fbf] flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <h4 className="text-base font-bold text-slate-800">全设备智能协同</h4>
        </div>
        <p className="text-xs text-slate-400 ml-[38px]">基于情境的一对一分发策略</p>
      </div>

      {/* Device Pills */}
      <div className="px-5 pb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {devices.map((d) => {
            const dm = DEVICE_META[d.id] || DEVICE_META.phone;
            const Icon = dm.icon;
            const selected = active === d.id;
            const count = d.strategies?.length || 0;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-200 whitespace-nowrap shrink-0",
                  selected
                    ? `bg-gradient-to-r ${dm.color} text-white border-transparent shadow-md shadow-${d.id === 'phone' ? 'blue' : 'slate'}-200/40`
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-sm"
                )}
              >
                <Icon className={cn("w-4 h-4", selected ? "text-white" : dm.text)} />
                <span className="text-sm font-medium">{d.name || dm.label}</span>
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                  selected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strategy Detail Panel */}
      <AnimatePresence mode="wait">
        {activeDevice && activeDevice.strategies?.length > 0 && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="px-5 pb-5"
          >
            <div className="space-y-2">
              {activeDevice.strategies.map((s, i) => {
                const pri = PRIORITY_STYLES[s.priority] || PRIORITY_STYLES.medium;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-3.5 p-3.5 rounded-xl border transition-colors",
                      "bg-white hover:bg-slate-50/80",
                      meta.border
                    )}
                  >
                    {/* Time badge */}
                    <div className={cn(
                      "flex flex-col items-center justify-center min-w-[52px] py-1.5 px-2 rounded-lg",
                      meta.bg
                    )}>
                      <Clock className={cn("w-3 h-3 mb-0.5", meta.text)} />
                      <span className={cn("text-[11px] font-bold font-mono", meta.text)}>
                        {s.time?.includes('T') ? s.time.split('T')[1]?.slice(0, 5) : s.time || "—"}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-800">{s.method}</span>
                        {s.priority && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full",
                            pri.bg
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", pri.dot)} />
                            {pri.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{s.content}</p>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {activeDevice && (!activeDevice.strategies || activeDevice.strategies.length === 0) && (
        <div className="px-5 pb-5">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-6 text-center">
            <p className="text-sm text-slate-400">暂无策略分配</p>
          </div>
        </div>
      )}
    </section>
  );
}