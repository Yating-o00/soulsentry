import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import SentinelGuardPanel from "./SentinelGuardPanel";

/**
 * 时空感知守护 - 独立模块
 * 基于用户的约定与心签，提供时空情境感知能力
 */
export default function SpatioTemporalGuardModule() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm p-4 md:p-8"
    >
      <div className="flex items-center gap-2.5 mb-5 md:mb-6">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-md">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-bold text-slate-800">时空感知守护</h3>
          <p className="text-xs text-slate-400">基于你的约定与心签</p>
        </div>
      </div>
      <SentinelGuardPanel />
    </motion.div>
  );
}