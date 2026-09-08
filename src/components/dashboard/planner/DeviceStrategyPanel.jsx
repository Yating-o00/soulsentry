import React from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEVICE_META = {
  phone:   { icon: Smartphone, name: "手机",   role: "主控终端",  solid: "bg-[#384877]", bg: "bg-[#384877]/5" },
  watch:   { icon: Watch,      name: "手表",   role: "触觉提醒",  solid: "bg-[#3b5aa2]", bg: "bg-[#3b5aa2]/5" },
  glasses: { icon: Glasses,    name: "眼镜",   role: "AR 视觉",   solid: "bg-[#6d5fd3]", bg: "bg-[#6d5fd3]/5" },
  car:     { icon: Car,        name: "汽车",   role: "车载语音",  solid: "bg-[#64748b]", bg: "bg-slate-500/5" },
  home:    { icon: Home,       name: "家居",   role: "环境调节",  solid: "bg-[#64748b]", bg: "bg-slate-500/5" },
  speaker: { icon: Home,       name: "音箱",   role: "语音中枢",  solid: "bg-[#64748b]", bg: "bg-slate-500/5" },
  pc:      { icon: Monitor,    name: "工作站", role: "深度工作",  solid: "bg-[#4a5f9e]", bg: "bg-[#4a5f9e]/5" },
  tablet:  { icon: Monitor,    name: "平板",   role: "辅助屏",    solid: "bg-[#5b6dae]", bg: "bg-[#5b6dae]/5" },
};

// 优先级只留一个字:高 / 中 / 低
const PRIORITY_CONFIG = {
  high:   { label: "高", badge: "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20" },
  medium: { label: "中", badge: "bg-[#3b5aa2]/10 text-[#3b5aa2] ring-1 ring-[#3b5aa2]/20" },
  low:    { label: "低", badge: "bg-slate-400/10 text-slate-500 ring-1 ring-slate-400/20" },
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
        <div className={cn("px-4 sm:px-6 py-5 flex items-center justify-between", meta.bg)}>
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md",
              meta.solid
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

        {/* 策略行:整条撑满可用宽度 —— 时间 | 内容(撑开) | 优先级(单字) | 动作 */}
        <div className="px-3 sm:px-4 pb-4">
          <div className="space-y-0.5">
            {strategies.map((s, i) => {
              const time = formatTime(s.time);
              const priorityCfg = PRIORITY_CONFIG[s.priority] || PRIORITY_CONFIG.medium;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="group flex items-center gap-2.5 sm:gap-3 rounded-xl px-2.5 sm:px-3 py-3 hover:bg-slate-50/80 transition-colors"
                >
                  {/* 优先级色点 */}
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      s.priority === 'high' ? "bg-rose-500" :
                      s.priority === 'medium' ? "bg-[#3b5aa2]" :
                      "bg-slate-300"
                    )}
                  />
                  {/* 时间 */}
                  <span className="num w-[46px] shrink-0 text-[12.5px] font-semibold text-slate-700">
                    {time}
                  </span>
                  {/* 内容:占满剩余宽度 */}
                  <p className="min-w-0 flex-1 text-[13px] leading-snug text-slate-700">
                    {s.content}
                  </p>
                  {/* 优先级:单字徽章 */}
                  <span
                    className={cn(
                      "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                      priorityCfg.badge
                    )}
                    title={`${priorityCfg.label}优先级`}
                  >
                    {priorityCfg.label}
                  </span>
                  {/* 实施动作 */}
                  <span className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500 group-hover:border-[#384877]/25 group-hover:text-[#384877] transition-colors">
                    <Zap className="h-3 w-3" />
                    {s.method}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}