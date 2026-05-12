import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, AlertTriangle, RefreshCw, Edit3, UserCog,
  FileText, Mail, Globe, FileSpreadsheet, Calendar as CalIcon, StickyNote, ChevronRight, Sparkles,
} from "lucide-react";

const TYPE_ICON = {
  email_draft: Mail,
  web_research: Globe,
  office_doc: FileSpreadsheet,
  file_organize: FileText,
  calendar_event: CalIcon,
  summary_note: StickyNote,
};

const TYPE_LABEL = {
  email_draft: "邮件草稿",
  web_research: "网页调研",
  office_doc: "办公文档",
  file_organize: "文件整理",
  calendar_event: "日历事件",
  summary_note: "心签总结",
};

/**
 * 任务执行后的反馈弹窗：
 * - mode="success" 明确告知结果摘要 + 查看详情/继续按钮
 * - mode="failed"  展示困难原因 + 三种处置建议（重试 / 修改后重试 / 人工接管）
 */
export default function ExecutionResultDialog({
  open,
  onOpenChange,
  mode = "success",          // "success" | "failed"
  title = "",
  automationType = "summary_note",
  resultPreview = "",        // success: 结果摘要文本
  errorMessage = "",         // failed: 错误描述
  suggestions = [],          // failed: AI 给出的修改建议字符串数组
  onRetry,                   // failed: 直接重试
  onRetryWithEdit,           // failed: (newInput) => Promise  携带新输入重试
  onHandover,                // failed: 人工接管（如转为普通约定 / 打开编辑器）
  onViewDetail,              // success: 查看完整结果
}) {
  const [editMode, setEditMode] = useState(false);
  const [editInput, setEditInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const Icon = TYPE_ICON[automationType] || StickyNote;
  const typeLabel = TYPE_LABEL[automationType] || "自动任务";

  const handleSubmitEdit = async () => {
    if (!editInput.trim() || !onRetryWithEdit) return;
    setSubmitting(true);
    try {
      await onRetryWithEdit(editInput.trim());
      onOpenChange?.(false);
    } finally {
      setSubmitting(false);
      setEditMode(false);
      setEditInput("");
    }
  };

  const close = () => {
    setEditMode(false);
    setEditInput("");
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-slate-200">
        {/* 顶部状态条 */}
        <div className={`relative px-5 pt-5 pb-4 ${
          mode === "success"
            ? "bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30"
            : "bg-gradient-to-br from-amber-50 via-white to-rose-50/40"
        }`}>
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 18 }}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-md ${
                  mode === "success"
                    ? "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30"
                    : "bg-gradient-to-br from-amber-400 to-rose-500 shadow-amber-500/30"
                }`}
              >
                {mode === "success"
                  ? <CheckCircle2 className="w-6 h-6 text-white" />
                  : <AlertTriangle className="w-6 h-6 text-white" />}
              </motion.div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                  {mode === "success" ? "AI 执行成功" : "执行遇到困难"}
                </DialogTitle>
                <DialogDescription className="text-[11.5px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <Icon className="w-3 h-3" />
                  {typeLabel}
                  <span className="text-slate-300">·</span>
                  <span className="truncate">{title}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* 内容区 */}
        <div className="px-5 py-4 max-h-[55vh] overflow-y-auto">
          {mode === "success" ? (
            <SuccessContent resultPreview={resultPreview} />
          ) : (
            <FailedContent
              errorMessage={errorMessage}
              suggestions={suggestions}
              editMode={editMode}
              editInput={editInput}
              setEditInput={setEditInput}
              submitting={submitting}
            />
          )}
        </div>

        {/* 操作区 */}
        <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end gap-2">
          {mode === "success" ? (
            <>
              <Button variant="ghost" size="sm" onClick={close} className="h-8 text-xs text-slate-500">
                完成
              </Button>
              {onViewDetail && (
                <Button
                  size="sm"
                  onClick={() => { onViewDetail(); close(); }}
                  className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  查看完整结果
                  <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
              )}
            </>
          ) : editMode ? (
            <>
              <Button
                variant="ghost" size="sm"
                onClick={() => { setEditMode(false); setEditInput(""); }}
                className="h-8 text-xs text-slate-500"
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitEdit}
                disabled={!editInput.trim() || submitting}
                className="h-8 px-3 text-xs bg-[#384877] hover:bg-[#2d3a5f] text-white"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {submitting ? "提交中…" : "用新内容重试"}
              </Button>
            </>
          ) : (
            <>
              {onHandover && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => { onHandover(); close(); }}
                  className="h-8 text-xs border-slate-200 text-slate-600"
                >
                  <UserCog className="w-3 h-3 mr-1" />
                  人工接管
                </Button>
              )}
              {onRetryWithEdit && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => setEditMode(true)}
                  className="h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  修改后重试
                </Button>
              )}
              {onRetry && (
                <Button
                  size="sm"
                  onClick={() => { onRetry(); close(); }}
                  className="h-8 px-3 text-xs bg-[#384877] hover:bg-[#2d3a5f] text-white"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  重试
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SuccessContent({ resultPreview }) {
  return (
    <div className="space-y-3">
      <div className="text-[12.5px] text-slate-600 leading-relaxed">
        AI 已按你的要求完成本项任务，结果摘要如下：
      </div>
      <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 px-3.5 py-3">
        <div className="text-[10px] font-semibold text-emerald-700 mb-1.5 tracking-wide">执行结果</div>
        <div className="text-[12.5px] text-slate-800 leading-[1.65] whitespace-pre-wrap line-clamp-[10]">
          {resultPreview || "已生成结果，点击下方按钮查看完整内容。"}
        </div>
      </div>
      <div className="text-[11px] text-slate-400 leading-relaxed">
        ✓ 已自动同步至执行历史 · 可在「通知」页随时回看
      </div>
    </div>
  );
}

function FailedContent({ errorMessage, suggestions, editMode, editInput, setEditInput, submitting }) {
  if (editMode) {
    return (
      <div className="space-y-2">
        <div className="text-[12px] text-slate-600">
          请补充或修正你的需求，AI 会按新内容重新尝试：
        </div>
        <Textarea
          value={editInput}
          onChange={(e) => setEditInput(e.target.value)}
          placeholder="例如：把对方称呼改为「王经理」，并加上紧急程度…"
          className="min-h-[100px] text-[13px] rounded-xl border-slate-200 focus-visible:ring-[#384877]/30"
          autoFocus
          disabled={submitting}
        />
        <div className="text-[11px] text-slate-400">提示：越具体的描述，AI 越能精准完成。</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-rose-50/70 border border-rose-100 px-3.5 py-3">
        <div className="text-[10px] font-semibold text-rose-700 mb-1.5 tracking-wide">遇到的问题</div>
        <div className="text-[12.5px] text-slate-800 leading-relaxed">
          {errorMessage || "AI 未能顺利完成本项任务，可能是描述不够清晰或缺少关键信息。"}
        </div>
      </div>

      {suggestions && suggestions.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-600 mb-1.5">建议尝试</div>
          <ul className="space-y-1.5">
            {suggestions.slice(0, 3).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-slate-600 leading-relaxed">
                <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[11px] text-slate-400 leading-relaxed pt-1">
        你可以「重试」直接再执行一次，「修改后重试」补充新信息，或选择「人工接管」自己处理。
      </div>
    </div>
  );
}