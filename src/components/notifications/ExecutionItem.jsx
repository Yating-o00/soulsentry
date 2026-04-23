import React, { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, RotateCcw, CheckCircle2, XCircle, Zap, Clock, AlertTriangle, Sparkles, Brain, ArrowRight, Calendar, ListChecks, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ExecutionStepFlow from "./ExecutionStepFlow";
import { SOURCE_CONFIG } from "@/components/utils/trackExecution";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  const cat = categoryConfig[execution.category] || categoryConfig.task;
  const status = statusConfig[execution.execution_status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const completedSteps = (execution.execution_steps || []).filter(s => s.status === "completed").length;
  const totalSteps = (execution.execution_steps || []).length;

  // 节点状态手动变更：同步到后端，并按节点整体状况推算 execution_status
  const handleStepStatusChange = async (index, newStatus) => {
    const now = new Date().toISOString();
    const currentSteps = execution.execution_steps || [];
    const nextSteps = currentSteps.map((s, i) =>
      i === index
        ? { ...s, status: newStatus, timestamp: newStatus === "todo" ? null : now }
        : s
    );

    // 根据新步骤列表推算整体执行状态
    const activeSteps = nextSteps.filter((s) => s.status !== "skipped");
    const hasRunning = nextSteps.some((s) => s.status === "running");
    const allDoneOrSkipped = nextSteps.every(
      (s) => s.status === "completed" || s.status === "skipped"
    );
    const hasProgress = activeSteps.some((s) => s.status === "completed" || s.status === "running");

    let nextExecStatus = execution.execution_status;
    let completedAt = execution.completed_at || null;

    if (activeSteps.length > 0 && allDoneOrSkipped) {
      nextExecStatus = "completed";
      completedAt = now;
    } else if (hasRunning) {
      nextExecStatus = "executing";
      completedAt = null;
    } else if (hasProgress) {
      nextExecStatus = "executing";
      completedAt = null;
    } else {
      // 所有步骤都被重置/跳过 → 回到 pending
      nextExecStatus = "pending";
      completedAt = null;
    }

    try {
      await base44.entities.TaskExecution.update(execution.id, {
        execution_steps: nextSteps,
        execution_status: nextExecStatus,
        completed_at: completedAt,
      });
      queryClient.invalidateQueries({ queryKey: ["task-executions"] });
      const labelMap = {
        completed: "已标记完成",
        running: "已标记执行中",
        skipped: "已跳过",
        todo: "已重置为待执行",
      };
      toast.success(labelMap[newStatus] || "已更新", { duration: 1500 });
    } catch (e) {
      toast.error("更新失败：" + (e.message || "请重试"));
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
              const runningCount = (execution.execution_steps || []).filter(s => s.status === "running").length;
              const doneCount = (execution.execution_steps || []).filter(s => s.status === "completed").length;
              const isExecuting = execution.execution_status === "executing" || runningCount > 0;
              const progress = Math.round((doneCount / totalSteps) * 100);
              return (
                <div className="mt-3 relative rounded-2xl overflow-hidden border border-indigo-100/80 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/30 shadow-[0_1px_2px_rgba(99,102,241,0.04)]">
                  {/* 顶部装饰光条 */}
                  <div className={`absolute inset-x-0 top-0 h-[2px] ${isExecuting ? 'bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-pulse' : 'bg-gradient-to-r from-transparent via-indigo-200 to-transparent'}`} />

                  {/* Header */}
                  <div className="flex items-center justify-between px-3 pt-3 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm shadow-indigo-500/30">
                        <Zap className="w-3.5 h-3.5 text-white" fill="currentColor" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-800 leading-tight">执行链路</span>
                        <span className="text-[10px] text-slate-400 leading-tight">AI 智能编排</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* 进度胶囊 */}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white border border-slate-200/80">
                        {isExecuting && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 animate-ping" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold tabular-nums ${isExecuting ? 'text-indigo-600' : 'text-slate-500'}`}>
                          {doneCount}<span className="text-slate-300 font-normal mx-0.5">/</span>{totalSteps}
                        </span>
                        <span className="text-[9px] text-slate-400">·</span>
                        <span className="text-[10px] text-slate-500 font-medium">{progress}%</span>
                      </div>
                    </div>
                  </div>

                  {/* 进度条 */}
                  <div className="px-3">
                    <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isExecuting ? 'bg-gradient-to-r from-indigo-400 to-purple-500' : 'bg-gradient-to-r from-emerald-400 to-teal-400'}`}
                        style={{ width: `${Math.max(progress, doneCount > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* 节点流 */}
                  <div className="px-3 py-3">
                    <ExecutionStepFlow
                      steps={execution.execution_steps}
                      onStepStatusChange={handleStepStatusChange}
                    />
                    <p className="mt-2 text-[10px] text-slate-400">
                      💡 点击节点可手动标记完成/跳过或重置
                    </p>
                  </div>
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

              {/* 用户意图 / AI 理解与执行摘要 / 执行日志 已隐藏——仅后台运作 */}

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