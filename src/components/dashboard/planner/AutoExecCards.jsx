import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, ChevronRight, Sparkles, Zap, Plus, FileText, Mail, Globe, FileSpreadsheet, Calendar as CalIcon, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import AutomationDetailDialog from "@/components/automation/AutomationDetailDialog";
import ExecutionResultDialog from "@/components/automation/ExecutionResultDialog";

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

// 统一使用应用主色调（#384877 深蓝）+ 中性灰，避免彩虹色冲突
const TYPE_META = {
  email_draft:    { icon: Mail,            bg: "bg-[#384877]/8",  color: "text-[#384877]", label: "邮件" },
  web_research:   { icon: Globe,           bg: "bg-[#384877]/8",  color: "text-[#384877]", label: "调研" },
  office_doc:     { icon: FileSpreadsheet, bg: "bg-[#384877]/8",  color: "text-[#384877]", label: "文档" },
  file_organize:  { icon: FileText,        bg: "bg-[#384877]/8",  color: "text-[#384877]", label: "文件" },
  calendar_event: { icon: CalIcon,         bg: "bg-[#384877]/8",  color: "text-[#384877]", label: "日历" },
  summary_note:   { icon: StickyNote,      bg: "bg-[#384877]/8",  color: "text-[#384877]", label: "心签" },
};

const STATUS_STYLE = {
  ready:      { dot: "bg-[#384877]",   text: "text-[#384877]",   label: "就绪",   border: "border-l-[#384877]/30" },
  pending:    { dot: "bg-amber-500",   text: "text-amber-700",   label: "待确认", border: "border-l-amber-400" },
  running:    { dot: "bg-[#3b5aa2]",   text: "text-[#3b5aa2]",   label: "执行中", border: "border-l-[#3b5aa2]", pulse: true },
  done:       { dot: "bg-emerald-500", text: "text-emerald-700", label: "完成",   border: "border-l-emerald-400" },
  failed:     { dot: "bg-rose-500",    text: "text-rose-700",    label: "失败",   border: "border-l-rose-400" },
};

function normalizeStatus(s) {
  if (!s) return "ready";
  const v = String(s).toLowerCase();
  if (v === "active" || v === "monitoring" || v === "in_progress") return "running";
  if (v === "completed") return "done";
  if (["ready","pending","running","done","failed"].includes(v)) return v;
  return "ready";
}

// 从 automation_result 中提炼一段可在卡片内直接展示的摘要文本
function extractPreview(ar) {
  if (!ar) return "";
  if (ar.preview && typeof ar.preview === "string") return ar.preview.trim();
  if (ar.data) {
    const d = ar.data;
    // 邮件：主题 + 收件人 + 正文片段
    if (d.subject || d.body || d.to) {
      const lines = [];
      if (d.subject) lines.push(`📧 ${d.subject}`);
      if (d.to) lines.push(`收件人：${d.to}`);
      if (d.body) lines.push("");
      if (d.body) lines.push(String(d.body));
      return lines.join("\n").trim();
    }
    // 会议纪要 / 文档：title + summary / content
    if (d.title || d.summary || d.content) {
      const lines = [];
      if (d.title) lines.push(d.title);
      if (d.summary) lines.push(d.summary);
      if (d.content) lines.push(String(d.content));
      return lines.join("\n").trim();
    }
    if (typeof d === "string") return d;
    return JSON.stringify(d, null, 2);
  }
  return "";
}

export default function AutoExecCards({ tasks = [], userText = "" }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState([]);
  const [openExec, setOpenExec] = useState(null);
  const [feedback, setFeedback] = useState(null); // { mode, item, resultPreview?, errorMessage?, suggestions? }

  // 把 props 同步进 state（保持父组件传入的最新清单），但保留本地已授权状态
  React.useEffect(() => {
    const list = (tasks || []).slice(0, 6).map((t, i) => ({
      _id: `plan-${i}-${(t.title || "").slice(0, 12)}`,
      title: t.title || `自动项 ${i + 1}`,
      desc: t.desc || t.description || "根据规划自动派生",
      status: normalizeStatus(t.status),
      automation_type: inferAutomationType(t.title, t.desc || t.description),
      execution_id: t.execution_id || null,
      result_preview: null,
    }));
    setItems(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(tasks)]);

  // 自动为「已完成且带 execution_id 但缺预览」的卡片拉取结果
  React.useEffect(() => {
    const targets = items.filter(it => it.status === "done" && it.execution_id && !it.result_preview);
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const it of targets) {
        const exec = await base44.entities.TaskExecution.get(it.execution_id).catch(() => null);
        if (cancelled || !exec) continue;
        const preview = extractPreview(exec.automation_result);
        if (preview) updateItem(it._id, { result_preview: preview });
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map(i => i._id + i.status + (i.execution_id || "")).join("|")]);

  if (items.length === 0) return null;

  const updateItem = (id, patch) => setItems(prev => prev.map(it => it._id === id ? { ...it, ...patch } : it));

  // 授权 → 创建 TaskExecution → plan → execute（支持 overrideInput 重试时携带修改后的需求）
  const handleAuthorize = async (item, overrideInput) => {
    updateItem(item._id, { status: "running" });
    const input = overrideInput || item.desc || item.title;
    try {
      const exec = await base44.entities.TaskExecution.create({
        task_title: item.title,
        original_input: input,
        category: "task",
        execution_status: "parsing",
        automation_type: item.automation_type,
        ai_parsed_result: {
          source: "smart_daily_planner",
          summary: input,
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

      // 成功反馈：拉取最终 execution 并取 preview 作为摘要
      const finalExec = await base44.entities.TaskExecution.get(exec.id).catch(() => null);
      const preview = extractPreview(finalExec?.automation_result);
      updateItem(item._id, { status: "done", result_preview: preview });
      setFeedback({
        mode: "success",
        item: { ...item, execution_id: exec.id },
        resultPreview: preview,
      });
    } catch (e) {
      updateItem(item._id, { status: "failed" });
      const msg = e?.message || "未知错误";
      setFeedback({
        mode: "failed",
        item,
        errorMessage: msg,
        suggestions: buildSuggestions(item.automation_type, msg),
      });
    }
  };

  const openExecution = async (item) => {
    if (!item.execution_id) return;
    const exec = await base44.entities.TaskExecution.get(item.execution_id);
    setOpenExec(exec);
  };

  return (
    <>
      <div className="relative rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50/60 to-[#384877]/5 p-5 shadow-[0_4px_24px_-12px_rgba(56,72,119,0.15)] overflow-hidden">
        {/* 背景装饰光晕 - 主色调 */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-[#384877]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-32 h-32 bg-[#3b5aa2]/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/25">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-[15px] font-bold text-slate-800">自动执行清单</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">点击「确认执行」由 AI 自动完成</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-[#384877] animate-pulse" />
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

      <ExecutionResultDialog
        open={!!feedback}
        onOpenChange={(o) => !o && setFeedback(null)}
        mode={feedback?.mode}
        title={feedback?.item?.title || ""}
        automationType={feedback?.item?.automation_type}
        resultPreview={feedback?.resultPreview}
        errorMessage={feedback?.errorMessage}
        suggestions={feedback?.suggestions}
        onRetry={feedback?.mode === "failed" ? () => handleAuthorize(feedback.item) : undefined}
        onRetryWithEdit={feedback?.mode === "failed"
          ? (newInput) => handleAuthorize(feedback.item, newInput)
          : undefined}
        onHandover={feedback?.mode === "failed" ? async () => {
          // 人工接管：创建一个普通约定，状态为待办，由用户手动处理
          try {
            await base44.entities.Task.create({
              title: feedback.item.title,
              description: `${feedback.item.desc || ""}\n\n⚠️ AI 自动执行失败，已转为人工待办。\n失败原因：${feedback.errorMessage || "未知"}`,
              status: "pending",
              priority: "medium",
              tags: ["人工接管", "AI失败回退"],
            });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.success("已转为人工待办，请在「约定」中处理", { icon: "👤" });
          } catch (err) {
            toast.error("接管失败：" + err.message);
          }
        } : undefined}
        onViewDetail={feedback?.mode === "success" && feedback?.item?.execution_id
          ? async () => {
              const exec = await base44.entities.TaskExecution.get(feedback.item.execution_id);
              setOpenExec(exec);
            }
          : undefined}
      />
    </>
  );
}

// 根据错误特征 + 任务类型生成「修改建议」
function buildSuggestions(automationType, errorMsg = "") {
  const msg = errorMsg.toLowerCase();
  const list = [];

  if (/timeout|超时|network|网络/.test(msg)) {
    list.push("网络可能不稳定，稍后重试一次通常即可解决。");
  }
  if (/key|api|密钥|401|403|权限/.test(msg)) {
    list.push("可能是相关服务未授权，请到「我的账户 → 集成」检查授权状态。");
  }
  if (/parse|json|格式|解析/.test(msg)) {
    list.push("AI 解析需求时出现歧义，建议把任务描述写得更具体（包含人名、时间、目标）。");
  }

  // 按类型补建议
  const byType = {
    email_draft: [
      "明确收件人、邮件主旨与希望传达的核心一句话。",
      "如果是回复某邮件，附带原始邮件标题会让 AI 更精准。",
    ],
    web_research: [
      "提供具体的关键词或要回答的问题，而非宽泛主题。",
      "限定信息源类型（行业报告 / 新闻 / 维基）会更聚焦。",
    ],
    office_doc: [
      "说明文档结构（如：3 页 PPT、含 3 个章节的 Word）。",
      "提供目标读者与核心结论，AI 会按对应口吻撰写。",
    ],
    file_organize: [
      "告诉 AI 整理后的目录结构或命名规则。",
    ],
    calendar_event: [
      "补充具体的开始/结束时间、参与人、是否要提醒。",
    ],
    summary_note: [
      "贴上要总结的原文或关键要点，AI 会更准确。",
    ],
  };
  (byType[automationType] || []).forEach(s => list.push(s));

  if (list.length === 0) {
    list.push("把任务描述补充得更具体（包含目标、对象、约束），通常就能修复。");
    list.push("如果仍不行，可以选择「人工接管」转为普通待办自己处理。");
  }
  return list.slice(0, 3);
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      whileHover={{ y: -1 }}
      className={`group relative bg-white rounded-xl border border-slate-200/80 border-l-[3px] ${status.border} px-3 py-2.5 hover:shadow-[0_6px_20px_-10px_rgba(56,72,119,0.25)] hover:border-[#384877]/30 transition-all duration-200 overflow-hidden`}
    >
      {/* Header: 图标 + 标题 + 类型 + 状态 */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-6 h-6 rounded-md ${meta.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-3 h-3 ${meta.color}`} />
        </div>
        <div className="text-[13px] font-semibold text-slate-800 truncate flex-1 leading-tight">{item.title}</div>
        <span className={`text-[9.5px] font-semibold ${meta.color} px-1.5 py-0.5 rounded ${meta.bg} flex-shrink-0`}>
          {meta.label}
        </span>
        <div className={`flex items-center gap-0.5 text-[9.5px] font-medium ${status.text} flex-shrink-0`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${status.pulse ? 'animate-pulse' : ''}`} />
          {status.label}
        </div>
      </div>

      {/* 描述 */}
      <div className="text-[11.5px] text-slate-500 line-clamp-2 leading-[1.5] pl-8 pr-1 mb-2">
        {item.desc}
      </div>

      {/* 已执行：内嵌结果预览（AI 产物） */}
      {isDone && item.result_preview && (
        <div className="ml-8 mb-2 rounded-lg bg-emerald-50/40 border border-emerald-100 px-2.5 py-2 max-h-32 overflow-y-auto">
          <div className="flex items-center gap-1 text-[9.5px] font-semibold text-emerald-700 mb-1">
            <Sparkles className="w-2.5 h-2.5" />
            AI 执行结果
          </div>
          <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-[1.5] line-clamp-5">
            {item.result_preview}
          </pre>
        </div>
      )}
      {isDone && !item.result_preview && item.execution_id && (
        <div className="ml-8 mb-2 text-[10.5px] text-slate-400 italic">
          正在加载执行结果…
        </div>
      )}

      {/* 操作行 */}
      <div className="flex items-center justify-end pl-8">
        {canAuthorize && (
          <Button
            size="sm"
            onClick={onAuthorize}
            className="h-6 px-2.5 text-[10.5px] font-medium bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2d3a5f] hover:to-[#324a8a] text-white rounded-md shadow-sm shadow-[#384877]/25 hover:shadow-[#384877]/40 transition-all"
          >
            <Sparkles className="w-2.5 h-2.5 mr-0.5" />
            确认执行
          </Button>
        )}
        {isRunning && (
          <span className="flex items-center gap-1 text-[10.5px] font-medium text-[#3b5aa2] px-2 py-0.5 rounded-md bg-[#384877]/8">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            执行中
          </span>
        )}
        {isDone && item.execution_id && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpen}
            className="h-6 px-2 text-[10.5px] text-emerald-600 hover:bg-emerald-50 rounded-md font-medium"
          >
            <Check className="w-2.5 h-2.5 mr-0.5" />
            查看完整结果
            <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}