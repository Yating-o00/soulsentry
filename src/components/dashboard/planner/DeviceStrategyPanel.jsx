import React from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEVICE_META = {
  phone:   { icon: Smartphone, name: "手机",   role: "主控终端",  gradient: "from-[#384877] to-[#3b5aa2]", bg: "bg-[#384877]/5" },
  watch:   { icon: Watch,      name: "手表",   role: "触觉提醒",  gradient: "from-[#3b5aa2] to-[#6366f1]", bg: "bg-slate-500/5" },
  glasses: { icon: Glasses,    name: "眼镜",   role: "AR视觉",   gradient: "from-[#6366f1] to-[#7c3aed]", bg: "bg-indigo-500/5" },
  car:     { icon: Car,        name: "汽车",   role: "车载系统",  gradient: "from-emerald-600 to-teal-700", bg: "bg-emerald-500/5" },
  home:    { icon: Home,       name: "家居",   role: "语音中枢",  gradient: "from-amber-500 to-orange-600", bg: "bg-amber-500/5" },
  pc:      { icon: Monitor,    name: "工作站", role: "深度工作",  gradient: "from-rose-500 to-pink-600", bg: "bg-rose-500/5" },
  tablet:  { icon: Monitor,    name: "平板",   role: "辅助屏",    gradient: "from-sky-500 to-indigo-500", bg: "bg-sky-500/5" },
};

const PRIORITY_CONFIG = {
  high:   { label: "高优先", badge: "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20" },
  medium: { label: "中优先", badge: "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20" },
  low:    { label: "低优先", badge: "bg-slate-400/10 text-slate-500 ring-1 ring-slate-400/20" },
};

function formatTime(raw) {
  if (!raw) return "—";
  if (raw.includes("T")) return raw.split("T")[1]?.slice(0, 5) || raw;
  if (raw.match(/^\d{1,2}:\d{2}/)) return raw.slice(0, 5);
  return raw;
}

/**
 * 纯展示组件：根据传入的 device + strategies 渲染时间轴
 * 由父组件控制选中哪台设备
 */
export default function DeviceStrategyPanel({ deviceType, deviceName, strategies = [] }) {
  const meta = DEVICE_META[deviceType] || DEVICE_META.phone;

  if (!strategies || strategies.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-50 flex items-center justify-center">
          <Shield className="w-5 h-5 text-slate-300" />
        </div>
        <p className="text-sm text-[#0a0a0f]/40">该设备暂无策略分配</p>
        <p className="text-xs text-[#0a0a0f]/25 mt-1">输入新安排后将自动分发</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={deviceType}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        className="rounded-3xl overflow-hidden border border-slate-100 bg-white shadow-[0_2px_20px_rgba(0,0,0,0.04)]"
      >
        <div className={cn("px-6 py-5 flex items-center justify-between", meta.bg)}>
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-md",
              meta.gradient
            )}>
              {(() => { const Icon = meta.icon; return <Icon className="w-5 h-5" />; })()}
            </div>
            <div>
              <h4 className="text-base font-bold text-[#0a0a0f] leading-tight">
                {deviceName || meta.name}
              </h4>
              <p className="text-xs text-[#0a0a0f]/45 mt-0.5">{meta.role} · {strategies.length} 条策略</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-emerald-600 font-medium">已就绪</span>
          </span>
        </div>

        <div className="px-6 py-4">
          <div className="relative">
            <div className="absolute left-[19px] top-6 bottom-6 w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent" />
            <div className="space-y-1">
              {strategies.map((s, i) => {
                const time = formatTime(s.time);
                const priorityCfg = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG.medium;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.3 }}
                    className="group relative pl-12 py-3.5 rounded-2xl hover:bg-slate-50/80 transition-colors"
                  >
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
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className="text-[13px] font-bold text-[#0a0a0f] tracking-tight">{time}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider",
                            priorityCfg.badge
                          )}>
                            {priorityCfg.label}
                          </span>
                        </div>
                        <p className="text-sm text-[#0a0a0f]/60 leading-relaxed">{s.content}</p>
                      </div>
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
    </AnimatePresence>
  );
}