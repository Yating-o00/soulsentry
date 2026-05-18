import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Cpu } from "lucide-react";
import DeviceStrategyMap from "./planner/DeviceStrategyMap";

/**
 * 全设备智能协同 — 独立模块
 * 从当日 DailyPlan 读取 devices 数据（由 SmartDailyPlanner 写入），
 * 作为 Dashboard 顶层模块单独展示。无数据时不渲染。
 */
export default function DeviceCollaborationModule() {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: planQueryData } = useQuery({
    queryKey: ['dailyPlan', todayStr],
    queryFn: () => base44.entities.DailyPlan.filter({ plan_date: todayStr }),
    staleTime: 2 * 60 * 1000,
  });

  const dayPlan = planQueryData?.[0] || null;
  const devices = dayPlan?.plan_json?.devices || [];

  if (devices.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="bg-white rounded-[28px] border border-slate-100/80 shadow-[0_8px_28px_rgba(140,147,201,0.12)] overflow-hidden"
    >
      <div className="px-5 md:px-6 pt-5 pb-4 border-b border-slate-100/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#384877] to-[#5b6dae] flex items-center justify-center shadow-lg shadow-[#384877]/25 shrink-0">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-[15px] leading-tight">全设备智能协同</h3>
            <p className="text-xs text-slate-400 mt-0.5">AI 自动调度多端设备分发策略</p>
          </div>
        </div>
      </div>
      <div className="px-5 md:px-6 py-5">
        <DeviceStrategyMap devices={devices} />
      </div>
    </motion.div>
  );
}