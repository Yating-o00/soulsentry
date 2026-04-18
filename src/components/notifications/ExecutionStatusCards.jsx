import React from "react";
import { Brain, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

const CARD_CONFIG = [
  {
    key: "parsing",
    label: "意图理解",
    icon: Brain,
    gradient: "from-[#384877] to-[#6366f1]",
    lightBg: "bg-[#384877]/5",
    borderColor: "border-[#384877]/20",
    textColor: "text-[#384877]",
    accentColor: "bg-[#384877]",
  },
  {
    key: "completed",
    label: "已执行",
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-teal-500",
    lightBg: "bg-emerald-50",
    borderColor: "border-emerald-200",
    textColor: "text-emerald-700",
    accentColor: "bg-emerald-500",
  },
  {
    key: "waiting",
    label: "待确认",
    icon: Clock,
    gradient: "from-amber-400 to-orange-400",
    lightBg: "bg-amber-50",
    borderColor: "border-amber-200",
    textColor: "text-amber-700",
    accentColor: "bg-amber-500",
  },
  {
    key: "failed",
    label: "异常",
    icon: AlertTriangle,
    gradient: "from-red-500 to-rose-500",
    lightBg: "bg-red-50",
    borderColor: "border-red-200",
    textColor: "text-red-700",
    accentColor: "bg-red-500",
  },
];

function getSubText(key, value, executing) {
  if (key === "parsing") return value > 0 ? `覆盖 ${value} 个入口` : "暂无输入";
  if (key === "completed") return "意图已转化为行动";
  if (key === "waiting") return executing > 0 ? `${executing} 项处理中` : "需要用户决策";
  if (key === "failed") return "执行未成功";
  return "";
}

export default function ExecutionStatusCards({ executions = [], activeStatus, onStatusClick }) {
  const executing = executions.filter(e => e.execution_status === "executing" || e.execution_status === "parsing").length;
  const completed = executions.filter(e => e.execution_status === "completed").length;
  const waitingConfirm = executions.filter(e => e.execution_status === "waiting_confirm").length;
  const failed = executions.filter(e => e.execution_status === "failed").length;
  const sources = new Set(executions.map(e => e.ai_parsed_result?.source).filter(Boolean));

  const values = {
    parsing: sources.size,
    completed,
    waiting: waitingConfirm + executing,
    failed,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {CARD_CONFIG.map((c, i) => {
        const val = values[c.key];
        const isActive = activeStatus === c.key;
        const Icon = c.icon;

        return (
          <motion.button
            key={c.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onStatusClick?.(isActive ? null : c.key)}
            className={`relative group text-left rounded-2xl p-4 border transition-all duration-200 overflow-hidden cursor-pointer
              ${isActive
                ? `${c.lightBg} ${c.borderColor} ring-2 ring-offset-1 ring-${c.key === "parsing" ? "[#384877]/30" : c.key === "completed" ? "emerald-300" : c.key === "waiting" ? "amber-300" : "red-300"} shadow-md`
                : `bg-white border-slate-100 hover:border-slate-200 hover:shadow-md shadow-sm`
              }`}
          >
            {/* Top accent bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.gradient} ${isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100"} transition-opacity`} />

            <div className="flex items-center justify-between mb-3 mt-1">
              <div className={`flex items-center gap-2 ${isActive ? c.textColor : "text-slate-500"}`}>
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium">{c.label}</span>
              </div>
              <div className={`w-2 h-2 rounded-full ${c.accentColor} ${val > 0 ? "animate-pulse" : "opacity-20"}`} />
            </div>

            <div className={`text-3xl font-bold mb-1 ${isActive ? c.textColor : "text-slate-900"}`}>
              {val}
            </div>
            <div className="text-[11px] text-slate-400 leading-tight">
              {getSubText(c.key, val, executing)}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}