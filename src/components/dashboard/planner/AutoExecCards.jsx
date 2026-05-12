import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, ChevronRight, Sparkles, Zap, Plus, FileText, Mail, Globe, FileSpreadsheet, Calendar as CalIcon, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import AutomationDetailDialog from "@/components/automation/AutomationDetailDialog";

// 从标题/描述粗略推断 automation_type，让单条卡片直接走 executeAutomation
function inferAutomationType(title = "", desc = "") {
  const t = `${title} ${desc}`.toLowerCase();
  if (/邮件|email|mail|发信|回邮/.test(t)) return "email_draft";
  if (/调研|research|查|搜索|网|资讯/.test(t)) return "web_research";
  if (/ppt|excel|word|文档|报告|方案|表格|演示/.test(t)) return "office_doc";
  if (/文件|整理|归档|分类|目录/.test(t)) return "file_organize";
  if (/日历|会议|预约|安排|事件/.test(t)) return "calendar_event";
  if (/笔记|总结|心签|note|summary|复盘/.test(t)) return "summary_note";
  return "summary_note";
}

const TYPE_META = {
  email_draft:    { icon: Mail,            bg: "bg-blue-50",    color: "text-blue-600",   label: "邮件草稿" },
  web_research:   { icon: Globe,           bg: "bg-cyan-50",    color: "text-cyan-600",   label: "网页调研" },
  office_doc:     { icon: FileSpreadsheet, bg: "bg-amber-50",   color: "text-amber-600",  label: "办公文档" },
  file_organize:  { icon: FileText,        bg: "bg-violet-50",  color: "text-violet-600", label: "文件整理" },
  calendar_event: { icon: CalIcon,         bg: "bg-emerald-50", color: "text-emerald-600",label: "日历事件" },
  summary_note:   { icon: StickyNote,      bg: "bg-pink-50",    color: "text-pink-600",   label: "总结心签" },
};

const STATUS_STYLE = {
  ready:      { dot: "bg-emerald-500", text: "text-emerald-600", label: "已就绪", border: "border-l-emerald-500" },
  pending:    { dot: "bg-amber-500",   text: "text-amber-600",   label: "待确认", border: "border-l-amber-500" },
  running:    { dot: "bg-blue-500",    text: "text-blue-600",    label: "执行中", border: "border-l-blue-500", pulse: true },
  done:       { dot: "bg-emerald-500", text: "text-emerald-600", label: "已完成", border: "border-l-emerald-500" },
  failed:     { dot: "bg-rose-500",    text: "text-rose-600",    label: "失败",   border: "border-l-rose-500" },
};

function normalizeStatus(s) {
  if (!s) return "ready";
  const v = String(s).toLowerCase();
  if (v === "active" || v === "monitoring" || v === "in_progress") return "running";
  if (v === "completed") return "done";
  if (["ready","pending","running","done","failed"].includes(v)) return v;
  return "ready";
}

export default function AutoExecCards({ tasks = [], userText = "" }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState([]);
  const [openExec, setOpenExec] = useState(null);

  // 把 props 同步进 state（保持父组件传入的最新清单），但保留本地已授权状态
  React.useEffect(() => {
    const list = (tasks || []).slice(0, 6).map((t, i) => ({
      _id: `plan-${i}-${(t.title || "").slice(0, 12)}`,
      title: t.title || `自动项 ${i + 1}`,
      desc: t.desc || t.description || "根据规划自动派生",
      status: normalizeStatus(t.status),
      automation_type: inferAutomationType(t.title, t.desc || t.description),
      execution_id: null,
    }));
    setItems(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(tasks)]);

  if (items.length === 0) return null;

  const updateItem = (id, patch) => setItems(prev => prev.map(it => it._id === id ? { ...it, ...patch } : it));

  // 授权 → 创建 TaskExecution → plan → execute
  const handleAuthorize = async (item) => {
    updateItem(item._id, { status: "running" });
    try {
      const exec = await base44.entities.TaskExecution.create({
        task_title: item.title,
        original_input: item.desc || item.title,
        category: "task",
        execution_status: "parsing",
        automation_type: item.automation_type,
        ai_parsed_result: {
          source: "smart_daily_planner",
          summary: item.desc || item.title,
          scene: userText || "",
        },
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      updateItem(item._id, { execution_id: exec.id });

      const planRes = await base44.functions.invoke('executeAutomation', { execution_id: exec.id, phase: "plan" });
      if (planRes.data?.error) throw new Error(planRes.data.error);

      const execRes = await base44.functions.invoke('executeAutomation', { execution_id: exec.id, phase: "execute" });
      if (execRes.data?.error) throw new Error(execRes.data.error);

      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      updateItem(item._id, { status: "done" });
      toast.success(`已完成：${item.title}`, { icon: "✅" });
    } catch (e) {
      updateItem(item._id, { status: "failed" });
      toast.error("执行失败：" + e.message);
    }
  };

  const openExecution = async (item) => {
    if (!item.execution_id) return;
    const exec = await base44.entities.TaskExecution.get(item.execution_id);
    setOpenExec(exec);
  };

  return (
    <>
      <div className="relative rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/20 p-5 shadow-[0_4px_24px_-8px_rgba(99,102,241,0.12)] overflow-hidden">
        {/* 背景装饰光晕 */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-br from-indigo-200/30 to-purple-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-32 h-32 bg-gradient-to-br from-blue-200/20 to-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-[15px] font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">自动执行清单</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">点击「确认执行」由 AI 自动完成</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 backdrop-blur-sm border border-slate-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-600">{items.length} 项待执行</span>
          </div>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence>
            {items.map((it) => (
              <ExecCard
                key={it._id}
                item={it}
                onAuthorize={() => handleAuthorize(it)}
                onOpen={() => openExecution(it)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AutomationDetailDialog
        execution={openExec}
        open={!!openExec}
        onOpenChange={(o) => !o && setOpenExec(null)}
      />
    </>
  );
}

function ExecCard({ item, onAuthorize, onOpen }) {
  const meta = TYPE_META[item.automation_type] || TYPE_META.summary_note;
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.ready;
  const Icon = meta.icon;
  const isRunning = item.status === "running";
  const isDone = item.status === "done";
  const canAuthorize = item.status === "ready" || item.status === "pending" || item.status === "failed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ y: -2 }}
      className={`group relative bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 border-l-[3px] ${status.border} p-3.5 hover:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.25)] hover:border-slate-200 transition-all duration-300`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0 ring-1 ring-inset ring-white/60 shadow-sm group-hover:scale-105 transition-transform`}>
          <Icon className={`w-4 h-4 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-[13.5px] font-semibold text-slate-800 truncate leading-snug">{item.title}</div>
            <div className={`flex items-center gap-1 text-[10px] font-semibold ${status.text} flex-shrink-0 px-1.5 py-0.5 rounded-md bg-white/80`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${status.pulse ? 'animate-pulse' : ''}`} />
              {status.label}
            </div>
          </div>
          <div className="text-[11.5px] text-slate-500 line-clamp-2 leading-relaxed mb-2.5">{item.desc}</div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-md ${meta.bg} ${meta.color} font-semibold tracking-wide`}>
              {meta.label}
            </span>

            <div className="flex-1" />

            {canAuthorize && (
              <Button
                size="sm"
                onClick={onAuthorize}
                className="h-7 px-3 text-[11px] bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                确认执行
              </Button>
            )}
            {isRunning && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 px-2 py-1 rounded-md bg-blue-50">
                <Loader2 className="w-3 h-3 animate-spin" />
                执行中
              </span>
            )}
            {isDone && item.execution_id && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onOpen}
                className="h-7 px-2.5 text-[11px] text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"
              >
                <Check className="w-3 h-3 mr-0.5" />
                查看结果
                <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}