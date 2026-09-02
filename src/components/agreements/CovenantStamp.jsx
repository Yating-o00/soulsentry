import React from "react";
import { motion } from "framer-motion";

// 朱砂「如约」印章 —— 完成约定时盖下的仪式感
export default function CovenantStamp() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.9, rotate: -22 }}
      animate={{ opacity: 1, scale: 1, rotate: -12 }}
      transition={{ type: "spring", stiffness: 260, damping: 16 }}
      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
    >
      <div className="w-24 h-24 rounded-full border-[3px] border-[#B23A2F] flex items-center justify-center bg-[#B23A2F]/8 shadow-[0_0_0_3px_rgba(178,58,47,0.12)]">
        <span className="font-handwriting text-3xl text-[#B23A2F] tracking-widest">如约</span>
      </div>
    </motion.div>
  );
}