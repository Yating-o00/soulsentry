import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, RotateCcw, CheckCircle2, XCircle, Zap, Clock, AlertTriangle, Sparkles, Brain, ArrowRight, Calendar, ListChecks, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import feedback from "@/lib/feedback.jsx";
import ExecutionStepFlow from "./ExecutionStepFlow";
import { SOURCE_CONFIG } from "@/components/utils/trackExecution";
import SentinelSummaryCard from "@/components/smart/SentinelSummaryCard";
import { useQuery } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();

  // 拉取关联任务的哨兵分析（仅在展开时启用）
  const { data: sentinelTask } = useQuery({
    queryKey: ['sentinel-task', execution.task_id],
    queryFn: () => base44.entities.Task.get(execution.task_id),
    enabled: expanded && !!execution.task_id,
    staleTime: 30_000,
  });
  const cat = categoryConfig[execution.category] || categoryConfig.task;
  const status = statusConfig[execution.execution_status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const completedSteps = (execution.execution_steps || []).filter(s => s.status === "completed").length;
  const totalSteps = (execution.execution_steps || []).length;

  // 手动/自动反馈：切换某步骤的完成状态，写回 TaskExecution
  const handleStepToggle = async (stepIndex) => {
    const currentSteps = execution.execution_steps || [];
    const step = currentSteps[stepIndex];
    if (!step) return;

    const isDone = step.status === "completed";
    const newStatus = isDone ? "todo" : "completed";
    const newSteps = currentSteps.map((s, i) =>
      i === stepIndex
        ? { ...s, status: newStatus, timestamp: new Date().toISOString() }
        : s
    );

    // 全部完成 → 自动把执行记录也标为 completed
    const allDone = newSteps.every(s => s.status === "completed");
    const anyDone = newSteps.some(s => s.status === "completed");
    const nextExecStatus = allDone
      ? "completed"
      : (execution.execution_status === "completed" && !allDone ? "executing" : execution.execution_status);

    const payload = { execution_steps: newSteps, execution_status: nextExecStatus };
    if (allDone) payload.completed_at = new Date().toISOString();

    // 乐观更新
    queryClient.setQueryData(['task-executions'], (old) => {
      if (!Array.isArray(old)) return old;
      return old.map(e => e.id === execution.id ? { ...e, ...payload } : e);
    });

    try {
      await base44.entities.TaskExecution.update(execution.id, payload);
      if (allDone) {
        feedback.executionChainDone(execution.task_title);
      } else if (!isDone) {
        feedback.success(`已标记「${step.step_name}」完成`);
      } else {
        feedback.info(`已取消「${step.step_name}」完成标记`);
      }
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    } catch (e) {
      feedback.error("更新失败，请重试");
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    }
  };

  // Extract source context from ai_parsed_result
  const parsed = execution.ai_parsed_result || null;
  const sourceKey = parsed?.source || null;
  const sourceCfg = sourceKey ? (SOURCE_CONFIG[sourceKey] || null) : null;

  // Determine link back to source page
  const sourceLink = sourceKey === "dashboard" ? createPageUrl("Dashboard")
    : sourceKey === "welcome" ? createPageUrl("Dashboard")
    : sourceKey === "calendar_day" || sourceKey === "calendar_week" || sourceKey === "calendar_month" ? createPageUrl("Dashboard")
    : sourceKey === "task" ? createPageUrl("Tasks")
    : sourceKey === "note" ? createPageUrl("Notes")
    : null;

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
                {parsed?.summary && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 flex items-center gap-1.5">
                    {sourceCfg && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 font-medium flex-shrink-0">{sourceCfg.emoji} {sourceCfg.label}</span>}
                    <span className="truncate">{parsed.summary}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[11px] text-slate-400">{format(new Date(execution.created_date), "MM-dd HH:mm", { locale: zhCN })}</span>
                <Badge variant="outline" className={`text-[10px] gap-1 ${status.color}`}>
                  <StatusIcon className={`w-3 h-3 ${status.animate ? "animate-pulse" : ""}`} />{status.label}
                </Badge>
              </div>
            </div>
            {totalSteps > 0 && (() => {
              const isRealityChain = (execution.execution_steps || []).every(s => s.status === "todo" || !!s.when_hint);
              const autoCount = (execution.execution_steps || []).filter(s => s.is_automation).length;
              return (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-[#384877]/[0.03] to-[#3b5aa2]/[0.03] border border-[#384877]/10">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm shadow-[#384877]/20">
                        <Zap className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-[#384877]">
                        {isRealityChain ? "事项链路" : "执行链路"}
                      </span>
                      {isRealityChain && (
                        <span className="text-[10px] text-slate-400">· AI 理解生成</span>
                      )}
                      {autoCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#384877]/8 text-[#384877] border border-[#384877]/15 font-medium">
                          含 {autoCount} 项自动
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {isRealityChain ? `${totalSteps} 项待办` : `${completedSteps}/${totalSteps}${execution.execution_status === "executing" ? " · 同步中" : ""}`}
                    </span>
                  </div>
                  <ExecutionStepFlow steps={execution.execution_steps} onStepToggle={handleStepToggle} />
                </div>
              );
            })()}
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

              {/* Source context card */}
              {sourceCfg && (
                <div className="mt-3 flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-slate-50 to-indigo-50/30 border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{sourceCfg.emoji}</span>
                    <div>
                      <div className="text-[11px] text-slate-400">输入来源</div>
                      <div className="text-xs font-medium text-slate-700">{sourceCfg.label}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {parsed?.plan_date && (
                      <Badge variant="outline" className="text-[10px] gap-1 text-slate-500 border-slate-200">
                        <Calendar className="w-3 h-3" />{parsed.plan_date}
                      </Badge>
                    )}
                    {sourceLink && (
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] text-indigo-600 hover:bg-indigo-50 gap-1" asChild onClick={(e) => e.stopPropagation()}>
                        <Link to={sourceLink}><ArrowRight className="w-3 h-3" />查看规划</Link>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* 情境哨兵摘要：合适的时间 / 地点 / 方式 */}
              {sentinelTask && <SentinelSummaryCard task={sentinelTask} />}

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