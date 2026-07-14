import React from "react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

// 极简状态条：三卡合一，一行读完今天
export default function StatStrip({ pendingTasks, overdueTasks, completedToday, completionRate, onOpenList }) {
  const items = [
    { label: "待办", value: pendingTasks.length, tone: "text-slate-900", title: "今日待办", tasks: pendingTasks },
    { label: "逾期", value: overdueTasks.length, tone: overdueTasks.length > 0 ? "text-red-500" : "text-slate-300", title: "逾期约定", tasks: overdueTasks },
    { label: "已完成", value: completedToday.length, tone: "text-emerald-600", title: "今日已完成", tasks: completedToday },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1 md:gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm px-3 md:px-5 py-2.5 md:py-3"
    >
      {items.map((item, idx) => (
        <React.Fragment key={item.label}>
          {idx > 0 && <div className="w-px h-6 bg-slate-100 mx-1 md:mx-2" />}
          <button
            type="button"
            onClick={() => onOpenList(item.title, item.tasks)}
            className="flex items-baseline gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors active:scale-95"
          >
            <span className={`text-xl md:text-2xl font-bold tabular-nums ${item.tone}`}>{item.value}</span>
            <span className="text-xs text-slate-400">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
      <div className="flex-1 flex items-center gap-2 md:gap-3 ml-2 md:ml-4 min-w-[80px]">
        <Progress value={completionRate} className="h-1.5 bg-slate-100 flex-1" indicatorClassName="bg-[#384877]" />
        <span className="text-xs font-medium text-slate-500 tabular-nums">{completionRate}%</span>
      </div>
    </motion.div>
  );
}