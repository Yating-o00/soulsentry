import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Sparkles, Loader2, ChevronRight, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AUTOMATION_TYPES, QUICK_AUTOMATION_TEMPLATES } from "./automationConfig";
import AutomationDetailDialog from "./AutomationDetailDialog";

export default function AutoExecutionPanel() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openExec, setOpenExec] = useState(null);

  const { data: executions = [] } = useQuery({
    queryKey: ['task-executions'],
    queryFn: () => base44.entities.TaskExecution.list("-created_date", 20),
    staleTime: 5000,
    refetchInterval: 4000,
  });

  // 仅展示有自动执行类型的记录
  const autoExecutions = executions.filter(e => e.automation_type && e.automation_type !== "none");
  const activeOnes = autoExecutions.filter(e =>
    ["parsing", "waiting_confirm", "executing", "failed"].includes(e.execution_status)
  ).slice(0, 5);
  const recentDone = autoExecutions.filter(e => e.execution_status === "completed").slice(0, 3);

  const handleSubmit = async (text) => {
    const content = (text || input).trim();
    if (!content) return;
    setSubmitting(true);
    try {
      const exec = await base44.entities.TaskExecution.create({
        task_title: content.length > 40 ? content.slice(0, 40) + "..." : content,
        original_input: content,
        category: "task",
        execution_status: "parsing",
        ai_parsed_result: { source: "dashboard", summary: content }
      });
      setInput("");
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });

      const res = await base44.functions.invoke('executeAutomation', {
        execution_id: exec.id,
        phase: "plan"
      });
      if (res.data?.error) throw new Error(res.data.error);

      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      // 直接打开方案对话框
      const updated = await base44.entities.TaskExecution.get(exec.id);
      setOpenExec(updated);
    } catch (e) {
      toast.error("AI 规划失败：" + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-none shadow-sm bg-gradient-to-br from-white to-indigo-50/30 overflow-hidden">
        <div className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-semibold text-slate-900">自动执行清单</h3>
                <p className="text-[11px] text-slate-500">让 AI 帮你写邮件、做调研、生成文档</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs text-indigo-600 hover:bg-indigo-50">
              <Link to={createPageUrl("Notifications")}>
                控制台<ChevronRight className="w-3 h-3 ml-0.5" />
              </Link>
            </Button>
          </div>

          {/* 快捷输入 */}
          <div className="flex gap-2 mb-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !submitting && handleSubmit()}
              placeholder="告诉 AI 你想自动完成什么..."
              className="text-sm bg-white"
              disabled={submitting}
            />
            <Button
              onClick={() => handleSubmit()}
              disabled={submitting || !input.trim()}
              className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] flex-shrink-0"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

          {/* 快捷模板 */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-hide">
            {QUICK_AUTOMATION_TEMPLATES.map(t => (
              <button
                key={t.type}
                onClick={() => handleSubmit(t.example)}
                disabled={submitting}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* 活跃任务清单 */}
          {activeOnes.length === 0 && recentDone.length === 0 && (
            <div className="text-center py-6 text-slate-400">
              <Sparkles className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              <p className="text-xs">还没有自动执行任务，试试上方的快捷指令</p>
            </div>
          )}

          {activeOnes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">进行中</div>
              <AnimatePresence>
                {activeOnes.map(exec => (
                  <ExecRow key={exec.id} exec={exec} onClick={() => setOpenExec(exec)} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {recentDone.length > 0 && (
            <div className="space-y-1.5 mt-3">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">最近完成</div>
              {recentDone.map(exec => (
                <ExecRow key={exec.id} exec={exec} onClick={() => setOpenExec(exec)} />
              ))}
            </div>
          )}
        </div>
      </Card>

      <AutomationDetailDialog
        execution={openExec}
        open={!!openExec}
        onOpenChange={(o) => !o && setOpenExec(null)}
      />
    </>
  );
}

function ExecRow({ exec, onClick }) {
  const cfg = AUTOMATION_TYPES[exec.automation_type] || AUTOMATION_TYPES.none;
  const Icon = cfg.icon;
  const status = exec.execution_status;

  const statusInfo = {
    parsing: { label: "规划中", color: "text-indigo-600 bg-indigo-50", pulse: true },
    waiting_confirm: { label: "待确认", color: "text-amber-600 bg-amber-50" },
    executing: { label: "执行中", color: "text-indigo-600 bg-indigo-50", pulse: true },
    completed: { label: "已完成", color: "text-emerald-600 bg-emerald-50" },
    failed: { label: "失败", color: "text-red-600 bg-red-50" },
    pending: { label: "待执行", color: "text-slate-500 bg-slate-50" },
  }[status] || { label: status, color: "text-slate-500 bg-slate-50" };

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all text-left"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-800 truncate">{exec.task_title}</div>
        <div className="text-[10px] text-slate-400 truncate">{cfg.label}</div>
      </div>
      <Badge variant="outline" className={`text-[10px] border-0 ${statusInfo.color} ${statusInfo.pulse ? 'animate-pulse' : ''}`}>
        {statusInfo.label}
      </Badge>
    </motion.button>
  );
}