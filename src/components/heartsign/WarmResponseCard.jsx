import React from "react";
import { motion } from "framer-motion";
import { Heart, GraduationCap, Coffee } from "lucide-react";

// 不同回应身份的视觉与文案配置
const PERSONA_CONFIG = {
  comforter: {
    label: "安慰者",
    defaultTitle: "一封来自安慰者的信",
    icon: Heart,
    gradient: "from-rose-50 to-pink-50/60",
    border: "border-rose-200/60",
    bar: "bg-rose-300",
    iconBg: "bg-rose-100 text-rose-500",
    titleColor: "text-rose-700/90",
    sign: "—— 一直在你身边",
  },
  mentor: {
    label: "师长",
    defaultTitle: "师长想对你说",
    icon: GraduationCap,
    gradient: "from-amber-50 to-orange-50/60",
    border: "border-amber-200/60",
    bar: "bg-amber-300",
    iconBg: "bg-amber-100 text-amber-600",
    titleColor: "text-amber-700/90",
    sign: "—— 与你共勉",
  },
  friend: {
    label: "朋友",
    defaultTitle: "想对你说",
    icon: Coffee,
    gradient: "from-teal-50 to-emerald-50/60",
    border: "border-teal-200/60",
    bar: "bg-teal-300",
    iconBg: "bg-teal-100 text-teal-600",
    titleColor: "text-teal-700/90",
    sign: "—— 你的朋友",
  },
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className={`relative mt-2 rounded-2xl p-4 border ${cfg.border} bg-gradient-to-br ${cfg.gradient} overflow-hidden`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${cfg.bar}`} aria-hidden />

      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-6 h-6 rounded-lg ${cfg.iconBg} flex items-center justify-center`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className={`text-[12.5px] font-medium ${cfg.titleColor} tracking-wide`}>
          {title}
        </span>
      </div>

      <p className="text-[14px] text-slate-700 leading-[1.85] whitespace-pre-wrap break-words font-serif">
        {ai.emotional_response}
      </p>

      <div className="mt-2.5 text-right">
        <span className={`text-[11px] ${cfg.titleColor} italic`}>{cfg.sign}</span>
      </div>
    </motion.div>
  );
}