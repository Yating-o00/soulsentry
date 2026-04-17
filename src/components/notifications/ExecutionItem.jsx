import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, RotateCcw, CheckCircle2, XCircle, Zap, Clock, AlertTriangle, Sparkles, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExecutionStepFlow from "./ExecutionStepFlow";

const categoryConfig = {
  promise: { label: "约定", emoji: "🤝", color: "bg-purple-50 text-purple-600 border-purple-200" },
  task: { label: "任务", emoji: "⚡", color: "bg-blue-50 text-blue-600 border-blue-200" },
  note: { label: "心签", emoji: "📝", color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
};

const statusConfig = {
  parsing: { label: "AI规划中", color: "bg-indigo-50 text-indigo-600 border-indigo-200", icon: Sparkles, animate: true },
  pending: { label: "待执行", color: "bg-slate-50 text-slate-600 border-slate-200", icon: Clock },
  executing: { label: "执行中", color: "bg-indigo-50 text-indigo-600 border-indigo-200", icon: Zap, animate: true },
  completed: { label: "已完成", color: "bg-emerald-50 text-emerald-600 border-emerald-200", icon: CheckCircle2 },
  failed: { label: "执行失败", color: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
  cancelled: { label: "已取消", color: "bg-slate-50 text-slate-400 border-slate-200", icon: XCircle },
  waiting_confirm: { label: "待确认", color: "bg-amber-50 text-amber-600 border-amber-200", icon: AlertTriangle },
};

export default function ExecutionItem({ execution, onRetry, onConfirm, onDismiss, onOpenAdvisor }) {
  const [expanded, setExpanded] = useState(false);
  const cat = categoryConfig[execution.category] || categoryConfig.task;
  const status = statusConfig[execution.execution_status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const completedSteps = (execution.execution_steps || []).filter(s => s.status === "completed").length;
  const totalSteps = (execution.execution_steps || []).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border transition-all hover:shadow-md ${
        execution.execution_status === "failed" ? "border-red-200 bg-white" :
        execution.execution_status === "waiting_confirm" ? "border-amber-200 bg-white" :
        execution.execution_status === "executing" || execution.execution_status === "parsing" ? "border-indigo-100 bg-white" :
        "border-slate-100 bg-white"
      }`}
    >
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex gap-3">
          <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center text-xl ${
              execution.execution_status === "executing" || execution.execution_status === "parsing" ? "bg-indigo-50 border-indigo-200" :
              execution.execution_status === "completed" ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
            }`}>{cat.emoji}</div>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cat.color}`}>{cat.label}</Badge>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                  <span className="truncate">{execution.task_title}</span>
                  {execution.execution_status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                </h4>
                {execution.ai_parsed_result?.summary && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{execution.ai_parsed_result.summary}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[11px] text-slate-400">{format(new Date(execution.created_date), "MM-dd HH:mm", { locale: zhCN })}</span>
                <Badge variant="outline" className={`text-[10px] gap-1 ${status.color}`}>
                  <StatusIcon className={`w-3 h-3 ${status.animate ? "animate-pulse" : ""}`} />{status.label}
                </Badge>
              </div>
            </div>
            {totalSteps > 0 && (
              <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-indigo-500" /><span className="text-xs font-medium text-slate-700">执行链路</span></div>
                  <span className="text-[11px] text-slate-400">{completedSteps}/{totalSteps}{execution.execution_status === "executing" && " · 同步中"}</span>
                </div>
                <ExecutionStepFlow steps={execution.execution_steps} />
              </div>
            )}
            {execution.execution_status === "waiting_confirm" && (
              <div className="mt-3 flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-xs font-medium text-amber-700">部分步骤需要确认</span></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={(e) => { e.stopPropagation(); onDismiss?.(execution); }}>忽略</Button>
                  <Button size="sm" className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={(e) => { e.stopPropagation(); onConfirm?.(execution); }}>全部确认</Button>
                </div>
              </div>
            )}
            {execution.execution_status === "failed" && (
              <div className="mt-3 flex items-center justify-between p-2.5 rounded-lg bg-red-50 border border-red-200">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <div><span className="text-xs font-medium text-red-700">执行失败</span>{execution.error_message && <p className="text-[11px] text-red-500">{execution.error_message}</p>}</div>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-100" onClick={(e) => { e.stopPropagation(); onRetry?.(execution); }}><RotateCcw className="w-3 h-3 mr-1" />重试</Button>
              </div>
            )}
          </div>
          <div className="flex-shrink-0 mt-1">{expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}</div>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-0 border-t border-slate-100 space-y-3">
              {execution.original_input && (
                <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-[11px] text-slate-500 mb-1">原始输入</div>
                  <p className="text-sm text-slate-700 italic">"{execution.original_input}"</p>
                </div>
              )}
              {execution.ai_parsed_result && (
                <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100">
                  <div className="text-[11px] text-indigo-500 font-medium mb-2">AI 解析结果</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {execution.ai_parsed_result.intent && <div><span className="text-slate-500">意图：</span><span className="text-slate-700">{execution.ai_parsed_result.intent}</span></div>}
                    {execution.ai_parsed_result.priority && <div><span className="text-slate-500">优先级：</span><span className="text-slate-700">{execution.ai_parsed_result.priority}</span></div>}
                  </div>
                </div>
              )}
              {execution.execution_steps?.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium mb-2">执行日志</div>
                  <div className="space-y-1.5">
                    {execution.execution_steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={step.status === "completed" ? "text-emerald-500" : step.status === "running" ? "text-indigo-500" : step.status === "failed" ? "text-red-500" : "text-slate-300"}>
                          {step.status === "completed" ? "✓" : step.status === "running" ? "●" : step.status === "failed" ? "✗" : "○"}
                        </span>
                        {step.timestamp && <span className="text-slate-400 font-mono">{format(new Date(step.timestamp), "HH:mm")}</span>}
                        <span className="text-slate-600">{step.detail || step.step_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 h-9" onClick={(e) => { e.stopPropagation(); onOpenAdvisor?.(execution); }}>
                <Brain className="w-4 h-4" />AI 执行顾问 · 获取智能建议
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}