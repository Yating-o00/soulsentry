import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { 
  Star, Heart, Minus, AlertTriangle, ThumbsDown,
  Briefcase, Users, User, Activity, GraduationCap, Home,
  MapPin, ChevronDown, ChevronUp, Lightbulb, Clock
} from "lucide-react";
import moment from "moment";

const MEMORY_TYPE_CONFIG = {
  work: { label: "工作记忆", color: "bg-red-100 text-red-600", dotColor: "bg-blue-500" },
  social: { label: "人际记忆", color: "bg-pink-100 text-pink-600", dotColor: "bg-pink-500" },
  personal: { label: "个人记忆", color: "bg-indigo-100 text-indigo-600", dotColor: "bg-indigo-500" },
  health: { label: "健康记忆", color: "bg-green-100 text-green-600", dotColor: "bg-green-500" },
  study: { label: "学习记忆", color: "bg-amber-100 text-amber-600", dotColor: "bg-amber-500" },
  family: { label: "家庭记忆", color: "bg-purple-100 text-purple-600", dotColor: "bg-purple-500" },
};

const EMOTION_CONFIG = {
  positive: { label: "积极", icon: Star, color: "text-amber-500" },
  warm: { label: "温暖", icon: Heart, color: "text-pink-500" },
  neutral: { label: "平和", icon: Minus, color: "text-slate-400" },
  anxious: { label: "焦虑", icon: AlertTriangle, color: "text-orange-500" },
  negative: { label: "低落", icon: ThumbsDown, color: "text-slate-500" },
};

const TYPE_ICONS = {
  work: Briefcase, social: Users, personal: User,
  health: Activity, study: GraduationCap, family: Home,
};

export default function MemoryTimelineCard({ memory, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const typeConfig = MEMORY_TYPE_CONFIG[memory.memory_type] || MEMORY_TYPE_CONFIG.personal;
  const emotionConfig = EMOTION_CONFIG[memory.emotion] || EMOTION_CONFIG.neutral;
  const EmotionIcon = emotionConfig.icon;

  return (
    <div className="relative flex gap-4 md:gap-6">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div className={`w-3.5 h-3.5 rounded-full ${typeConfig.dotColor} ring-4 ring-white shadow-sm z-10 flex-shrink-0`} />
        {!isLast && <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-200 to-slate-100 mt-1" />}
      </div>

      {/* Content card */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1 mb-6"
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-4 md:p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-500">
                  {moment(memory.event_date).format("YYYY年M月D日")}
                </span>
                <Badge className={`${typeConfig.color} text-xs font-medium border-0`}>
                  {typeConfig.label}
                </Badge>
              </div>
              <div className={`flex items-center gap-1 text-sm ${emotionConfig.color}`}>
                <EmotionIcon className="w-4 h-4" />
                <span className="font-medium">{emotionConfig.label}</span>
              </div>
            </div>

            {/* Title + content */}
            <h3 className="text-lg font-bold text-slate-800 mb-1.5">{memory.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{memory.content}</p>

            {/* People & location tags */}
            {(memory.people?.length > 0 || memory.locations?.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {memory.people?.map((p, i) => (
                  <Badge key={i} className="bg-blue-50 text-blue-600 border-0 text-xs">
                    {p.name}{p.role ? `（${p.role}）` : ""}
                  </Badge>
                ))}
                {memory.locations?.map((l, i) => (
                  <Badge key={`l-${i}`} className="bg-emerald-50 text-emerald-600 border-0 text-xs">
                    <MapPin className="w-3 h-3 mr-0.5" />
                    {l.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* AI Insight */}
            {memory.ai_insight && (
              <div className="mt-3">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1.5 text-xs text-[#384877] font-medium hover:underline"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  AI 记忆洞察
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-sm text-slate-700 space-y-1.5">
                        {memory.ai_insight.summary && (
                          <p><span className="font-semibold text-[#384877]">AI 记忆洞察：</span>{memory.ai_insight.summary}</p>
                        )}
                        {memory.ai_insight.suggestion && (
                          <p className="text-slate-600">{memory.ai_insight.suggestion}</p>
                        )}
                        {memory.ai_insight.context_note && (
                          <p className="text-xs text-slate-500 italic">{memory.ai_insight.context_note}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}