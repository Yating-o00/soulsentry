import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, Sparkles, Loader2, ChevronRight, Send, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AUTOMATION_TYPES, QUICK_AUTOMATION_TEMPLATES } from "./automationConfig";
import AutomationDetailDialog from "./AutomationDetailDialog";
import AutomationCandidateGrid from "./AutomationCandidateGrid";

export default function AutoExecutionPanel() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openExec, setOpenExec] = useState(null);
  const [recentExpanded, setRecentExpanded] = useState(false);

  // 候选清单态
  const [candidates, setCandidates] = useState([]);
  const [sceneSummary, setSceneSummary] = useState("");
  const [authorizingIds, setAuthorizingIds] = useState(new Set());
  const [authorizedIds, setAuthorizedIds] = useState(new Set());

  const { data: executions = [] } = useQuery({
    queryKey: ['task-executions'],
    queryFn: () => base44.entities.TaskExecution.list("-created_date", 20),
    staleTime: 5000,
    refetchInterval: 4000,
  });

  const autoExecutions = executions.filter(e => e.automation_type && e.automation_type !== "none");
  const allDone = autoExecutions.filter(e => e.execution_status === "completed");
  const recentDone = recentExpanded ? allDone : allDone.slice(0, 3);

  // 1) 发送：跳过候选清单，直接 plan → execute，结果对话框中查看产物
  const handleAnalyze = async (text) => {
    const content = (text || input).trim();
    if (!content) return;
    setSubmitting(true);
    setCandidates([]);
    setAuthorizedIds(new Set());
    try {
      const exec = await base44.entities.TaskExecution.create({
        task_title: content.slice(0, 60),
        original_input: content,
        category: "task",
        execution_status: "parsing",
        ai_parsed_result: { source: "dashboard_direct", summary: content },
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      // 立即打开对话框让用户看到规划进度
      setOpenExec(exec);

      const planRes = await base44.functions.invoke('executeAutomation', {
        execution_id: exec.id,
        phase: "plan",
      });
      if (planRes.data?.error) throw new Error(planRes.data.error);

      const execRes = await base44.functions.invoke('executeAutomation', {
        execution_id: exec.id,
        phase: "execute",
      });
      if (execRes.data?.error) throw new Error(execRes.data.error);

      const updated = await base44.entities.TaskExecution.filter({ id: exec.id });
      if (updated?.[0]) setOpenExec(updated[0]);
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    } catch (e) {
      toast.error("执行失败：" + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 2) 用户对单条子项点击"授权执行" → 创建 TaskExecution + 触发 executeAutomation
  const handleAuthorize = async (candidate) => {
    const id = candidate._id;
    setAuthorizingIds(prev => new Set(prev).add(id));
    try {
      const exec = await base44.entities.TaskExecution.create({
        task_title: candidate.title,
        original_input: candidate.detail || candidate.title,
        category: "task",
        execution_status: "parsing",
        automation_type: candidate.automation_type,
        ai_parsed_result: {
          source: "dashboard",
          summary: candidate.detail || candidate.title,
          scene: sceneSummary,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });

      // 规划 → 执行（一次性走完，让用户在结果对话框中查看产物）
      const planRes = await base44.functions.invoke('executeAutomation', {
        execution_id: exec.id,
        phase: "plan",
      });
      if (planRes.data?.error) throw new Error(planRes.data.error);

      const execRes = await base44.functions.invoke('executeAutomation', {
        execution_id: exec.id,
        phase: "execute",
      });
      if (execRes.data?.error) throw new Error(execRes.data.error);

      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      setAuthorizedIds(prev => new Set(prev).add(id));
      toast.success(`已完成：${candidate.title}`, { icon: "✅" });
    } catch (e) {
      toast.error("执行失败：" + e.message);
    } finally {
      setAuthorizingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // 3) 用户自定义添加一条子项 → 直接进入授权流程
  const handleAddCustom = (custom) => {
    const item = { ...custom, _id: `cand-${Date.now()}-custom` };
    setCandidates(prev => [...prev, item]);
    handleAuthorize(item);
  };

  // 4) 点击快捷模板：不走 AI 候选拆解，而是把示例填入输入框，
  //    直接按模板的 automation_type 创建一条执行，结果对话框中可直接编辑/发送
  const handleQuickTemplate = async (template) => {
    setInput(template.example);
    setCandidates([]);
    setSceneSummary("");
    const item = {
      _id: `quick-${Date.now()}`,
      title: template.label,
      detail: template.example,
      automation_type: template.type,
    };
    try {
      const exec = await base44.entities.TaskExecution.create({
        task_title: template.label,
        original_input: template.example,
        category: "task",
        execution_status: "parsing",
        automation_type: template.type,
        ai_parsed_result: {
          source: "quick_template",
          summary: template.example,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      // 立即打开结果对话框，用户能看到规划与产物
      setOpenExec(exec);

      const planRes = await base44.functions.invoke('executeAutomation', {
        execution_id: exec.id,
        phase: "plan",
      });
      if (planRes.data?.error) throw new Error(planRes.data.error);

      const execRes = await base44.functions.invoke('executeAutomation', {
        execution_id: exec.id,
        phase: "execute",
      });
      if (execRes.data?.error) throw new Error(execRes.data.error);

      // 拉取最新执行结果，刷新对话框内容
      const updated = await base44.entities.TaskExecution.filter({ id: exec.id });
      if (updated?.[0]) setOpenExec(updated[0]);
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    } catch (e) {
      toast.error("执行失败：" + e.message);
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
                <p className="text-[11px] text-slate-500">告诉 AI 你要的成果，直接生成对应内容</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs text-indigo-600 hover:bg-indigo-50">
              <Link to={createPageUrl("Notifications")}>
                控制台<ChevronRight className="w-3 h-3 ml-0.5" />
              </Link>
            </Button>
          </div>

          {/* 输入区 */}
          <div className="flex gap-2 mb-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !submitting && handleAnalyze()}
              placeholder="告诉 AI 你想自动完成什么..."
              className="text-sm bg-white"
              disabled={submitting}
            />
            <Button
              onClick={() => handleAnalyze()}
              disabled={submitting || !input.trim()}
              className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] flex-shrink-0"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

          {/* 快捷模板 */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {QUICK_AUTOMATION_TEMPLATES.map(t => (
              <button
                key={t.type}
                onClick={() => setInput(t.example)}
                disabled={submitting}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                title={t.example}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* AI 解析中提示 */}
          {submitting && candidates.length === 0 && (
            <div className="mt-4 flex items-center justify-center gap-2 py-6 text-indigo-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              AI 正在解析场景，拆解可自动执行的子项...
            </div>
          )}

          {/* 候选清单网格 */}
          {candidates.length > 0 && (
            <AutomationCandidateGrid
              candidates={candidates}
              authorizingIds={authorizingIds}
              authorizedIds={authorizedIds}
              onAuthorize={handleAuthorize}
              onAddCustom={handleAddCustom}
            />
          )}

          {/* 空态：仅在未输入时显示 */}
          {!submitting && candidates.length === 0 && recentDone.length === 0 && (
            <div className="text-center py-6 text-slate-400 mt-2">
              <Sparkles className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              <p className="text-xs">还没有自动执行任务，输入场景或点击上方快捷指令</p>
            </div>
          )}

          {/* 最近完成 */}
          {allDone.length > 0 && (
            <div className="space-y-1.5 mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between px-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  最近完成 {allDone.length > 3 && <span className="text-slate-400 normal-case ml-1">· {allDone.length}</span>}
                </div>
                {allDone.length > 3 && (
                  <button
                    onClick={() => setRecentExpanded(v => !v)}
                    className="flex items-center gap-0.5 text-[10px] text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    {recentExpanded ? <>收起 <ChevronUp className="w-3 h-3" /></> : <>展开全部 <ChevronDown className="w-3 h-3" /></>}
                  </button>
                )}
              </div>
              <div className={recentExpanded ? "space-y-1.5 max-h-72 overflow-y-auto pr-1" : "space-y-1.5"}>
                {recentDone.map(exec => (
                  <ExecRow key={exec.id} exec={exec} onClick={() => setOpenExec(exec)} />
                ))}
              </div>
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