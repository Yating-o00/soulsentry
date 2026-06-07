import React from "react";
import { motion } from "framer-motion";
import { Heart, GraduationCap, Coffee, Sparkles } from "lucide-react";

// 不同回应身份的视觉与文案配置
const PERSONA_CONFIG = {
  comforter: {
    label: "安慰者",
    defaultTitle: "一封来自安慰者的信",
    icon: Heart,
    gradient: "from-rose-50/90 via-pink-50/70 to-orange-50/50",
    border: "border-rose-200/50",
    glow: "bg-rose-200/40",
    bar: "from-rose-300 to-pink-300",
    iconBg: "bg-gradient-to-br from-rose-100 to-pink-100 text-rose-500",
    titleColor: "text-rose-700/90",
    signColor: "text-rose-400/80",
    sign: "—— 一直在你身边"
  },
  mentor: {
    label: "师长",
    defaultTitle: "师长想对你说",
    icon: GraduationCap,
    gradient: "from-amber-50/90 via-orange-50/70 to-yellow-50/50",
    border: "border-amber-200/50",
    glow: "bg-amber-200/40",
    bar: "from-amber-300 to-orange-300",
    iconBg: "bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600",
    titleColor: "text-amber-700/90",
    signColor: "text-amber-500/80",
    sign: "—— 与你共勉"
  },
  friend: {
    label: "朋友",
    defaultTitle: "想对你说",
    icon: Coffee,
    gradient: "from-teal-50/90 via-emerald-50/70 to-green-50/50",
    border: "border-teal-200/50",
    glow: "bg-teal-200/40",
    bar: "from-teal-300 to-emerald-300",
    iconBg: "bg-gradient-to-br from-teal-100 to-emerald-100 text-teal-600",
    titleColor: "text-teal-700/90",
    signColor: "text-teal-500/80",
    sign: "—— 你的朋友"
  }
};

/**
 * 温暖回应卡片：当心签被识别为生活记录 / 心灵灵感等感性内容时，
 * 以「安慰者 / 师长 / 朋友」的身份展示一段有人文温度的 AI 回应。
 */
export default function WarmResponseCard({ ai }) {
  if (!ai?.is_emotional || !ai?.emotional_response) return null;

  const cfg = PERSONA_CONFIG[ai.response_persona] || PERSONA_CONFIG.friend;
  const Icon = cfg.icon;
  const title = ai.response_title || cfg.defaultTitle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.05 }}
      className={`relative mt-2 mr-auto w-full rounded-[20px] p-5 border ${cfg.border} bg-gradient-to-br ${cfg.gradient} overflow-hidden text-left shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] backdrop-blur-sm`}>
      
      {/* 柔光晕染 */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full ${cfg.glow} blur-3xl pointer-events-none`} aria-hidden />
      <div className={`absolute -bottom-12 -left-8 w-28 h-28 rounded-full ${cfg.glow} blur-3xl opacity-60 pointer-events-none`} aria-hidden />

      {/* 左侧渐变光条 */}
      <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-gradient-to-b ${cfg.bar}`} aria-hidden />

      <div className="relative">
        <div className="flex items-center gap-2.5 mb-3.5">
          <motion.div
            initial={{ rotate: -8, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.15 }}
            className={`w-8 h-8 rounded-xl ${cfg.iconBg} flex items-center justify-center shadow-sm`}>
            
            <Icon className="w-4 h-4" />
          </motion.div>
          <span className={`text-[13px] font-medium ${cfg.titleColor} tracking-wide flex items-center gap-1.5`}>
            {title}
            <Sparkles className="w-3 h-3 opacity-50" />
          </span>
        </div>

        <p className="text-slate-700/95 leading-[2] tracking-wide whitespace-pre-wrap break-words font-handwriting selectable-text text-sm opacity-75 my-2">
          {ai.emotional_response}
        </p>

        <div className="mt-3.5 flex items-center justify-end gap-2">
          <span className={`h-px w-8 bg-gradient-to-r from-transparent ${cfg.bar} opacity-40`} aria-hidden />
          <span className={`text-[15px] ${cfg.signColor} font-handwriting`}>{cfg.sign}</span>
        </div>
      </div>
    </motion.div>);

}