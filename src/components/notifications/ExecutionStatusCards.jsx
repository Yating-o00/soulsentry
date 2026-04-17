import React from "react";
import { Zap, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

export default function ExecutionStatusCards({ executions = [] }) {
  const executing = executions.filter(e => e.execution_status === "executing" || e.execution_status === "parsing").length;
  const completed = executions.filter(e => e.execution_status === "completed").length;
  const waitingConfirm = executions.filter(e => e.execution_status === "waiting_confirm").length;
  const failed = executions.filter(e => e.execution_status === "failed").length;

  const cards = [
    { label: "执行中", value: executing, sub: "AI正在处理", icon: Zap, color: "border-l-indigo-500", dotColor: "bg-indigo-500", textColor: "text-indigo-400" },
    { label: "已完成", value: completed, sub: "今日成功执行", icon: CheckCircle2, color: "border-l-emerald-500", dotColor: "bg-emerald-500", textColor: "text-emerald-400" },
    { label: "待确认", value: waitingConfirm, sub: "需要用户决策", icon: Clock, color: "border-l-amber-500", dotColor: "bg-amber-500", textColor: "text-amber-400" },
    { label: "异常", value: failed, sub: "执行未成功", icon: AlertTriangle, color: "border-l-red-500", dotColor: "bg-red-500", textColor: "text-red-400" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`bg-white rounded-xl p-4 border border-slate-100 ${c.color} border-l-4 shadow-sm`}>
          <div className="flex justify-between items-start mb-1.5">
            <span className="text-xs text-slate-500">{c.label}</span>
            <div className={`w-2 h-2 rounded-full ${c.dotColor} ${c.value > 0 ? "animate-pulse" : "opacity-30"}`} />
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-0.5">{c.value}</div>
          <div className="text-[11px] text-slate-400">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}