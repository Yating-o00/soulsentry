import React from "react";
import { format } from "date-fns";
import { Clock, Flag, Tag } from "lucide-react";

const PRIORITY = { low: "低优先", medium: "中优先", high: "高优先", urgent: "紧急" };
const CATEGORY = { work: "工作", personal: "个人", health: "健康", study: "学习", family: "家庭", shopping: "购物", finance: "财务", other: "其他" };

export default function TaskMetaChips({ task }) {
  const chip = "inline-flex items-center gap-1.5 text-xs font-normal text-slate-500";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
      {task.reminder_time && (
        <span className={chip}>
          <Clock className="w-3.5 h-3.5 text-[#384877]" />
          {format(new Date(task.reminder_time), "MM/dd HH:mm")}
          {task.end_time && ` – ${format(new Date(task.end_time), "MM/dd HH:mm")}`}
        </span>
      )}
      {task.priority && (
        <span className={chip}>
          <Flag className={`w-3.5 h-3.5 ${["high", "urgent"].includes(task.priority) ? "text-rose-500" : "text-slate-400"}`} />
          {PRIORITY[task.priority]}
        </span>
      )}
      {task.category && (
        <span className={chip}>
          <Tag className="w-3.5 h-3.5 text-slate-400" />
          {CATEGORY[task.category] || task.category}
        </span>
      )}
    </div>
  );
}