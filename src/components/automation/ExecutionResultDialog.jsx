import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, RotateCcw, Pencil, UserCog, ChevronRight, Sparkles, X, Lightbulb, Download } from "lucide-react";

/**
 * 任务执行结果统一弹窗
 * mode = "success"
 *   - 明确告知完成；展示结果预览；提供「查看完整详情」入口
 * mode = "failed"
 *   - 告知失败原因；给出可执行的修改建议；提供「重试 / 修改描述后重试 / 人工接管」
 */
export default function ExecutionResultDialog({
  open,
  onOpenChange,
  mode = "success",
  title = "",
  automationType,
  // success
  resultPreview = "",
  onViewDetail,
  // failed
  errorMessage = "",
  suggestions = [],
  onRetry,
  onRetryWithEdit, // (newInput: string) => void
  onHandover,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) {
      setEditing(false);
      setDraft("");
    }
  }, [open, mode]);

  const isSuccess = mode === "success";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl">
        {/* 顶部色带 */}
        <div className={isSuccess
          ? "bg-gradient-to-br from-emerald-50 to-teal-50 px-6 pt-6 pb-5 border-b border-emerald-100/60"
          : "bg-gradient-to-br from-rose-50 to-amber-50 px-6 pt-6 pb-5 border-b border-rose-100/60"
        }>
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-white shadow-sm border flex items-center justify-center flex-shrink-0 ${
                isSuccess ? "border-emerald-200/60" : "border-rose-200/60"
              }`}>
                {isSuccess
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <AlertTriangle className="w-5 h-5 text-rose-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[15px] font-bold text-slate-800 leading-tight">
                  {isSuccess ? "✅ 执行成功" : "AI 执行遇到困难"}
                </DialogTitle>
                <DialogDescription className="text-[12px] text-slate-500 mt-0.5 truncate">
                  {title || "自动执行任务"}
                </DialogDescription>
              </div>
            </div>
            {!isSuccess && errorMessage && (
              <div className="text-[12px] text-rose-700 bg-white/70 border border-rose-200/60 rounded-lg px-3 py-2 leading-relaxed mt-2">
                {errorMessage}
              </div>
            )}
          </DialogHeader>
        </div>

        {/* 主体 */}
        <div className="px-6 py-5 space-y-3">
          {/* 成功 */}
          {isSuccess && (
            <>
              {(() => {
                // 从预览文本提取首个文件下载链接（支持复盘报告等已上传文件）
                const urlMatch = resultPreview && resultPreview.match(/https?:\/\/[^\s)）"】>]+/);
                const fileUrl = urlMatch ? urlMatch[0] : null;
                return fileUrl ? (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 px-3.5 py-2.5 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0">
                      <Download className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-emerald-800">下载已生成的文件</div>
                      <div className="text-[10.5px] text-emerald-600 truncate">{fileUrl}</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  </a>
                ) : null;
              })()}

              {resultPreview ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 max-h-56 overflow-y-auto">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    AI 结果预览
                  </div>
                  <pre className="text-[12px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {resultPreview}
                  </pre>
                </div>
              ) : (
                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  任务已完成，点击下方查看完整执行详情与结果。
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-9 rounded-xl text-[12px]"
                  onClick={() => onOpenChange(false)}
                >
                  关闭
                </Button>
                {onViewDetail && (
                  <Button
                    onClick={() => { onOpenChange(false); onViewDetail(); }}
                    className="flex-1 h-9 rounded-xl text-[12px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
                  >
                    查看完整详情
                    <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                )}
              </div>
            </>
          )}

          {/* 失败 - 选择视图 */}
          {!isSuccess && !editing && (
            <>
              {suggestions.length > 0 && (
                <div className="rounded-xl bg-amber-50/70 border border-amber-200/60 px-3.5 py-3">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-700 mb-1.5">
                    <Lightbulb className="w-3.5 h-3.5" />
                    修改建议
                  </div>
                  <ul className="space-y-1.5 text-[12px] text-slate-700 leading-relaxed">
                    {suggestions.map((s, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-amber-500 flex-shrink-0">·</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {onRetry && (
                <button
                  onClick={() => { onOpenChange(false); onRetry(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-[#384877]/40 hover:bg-[#384877]/5 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#384877]/10 flex items-center justify-center flex-shrink-0">
                    <RotateCcw className="w-4 h-4 text-[#384877]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-800">原样重试</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">网络/接口波动时常常重试就能成功</div>
                  </div>
                </button>
              )}

              {onRetryWithEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-amber-400/60 hover:bg-amber-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Pencil className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-800">修改描述后重试</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">补充细节或换个说法让 AI 更好理解</div>
                  </div>
                </button>
              )}

              {onHandover && (
                <button
                  onClick={() => { onOpenChange(false); onHandover(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-emerald-400/60 hover:bg-emerald-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <UserCog className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-800">我来接管</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">转为人工待办，由你手动处理</div>
                  </div>
                </button>
              )}
            </>
          )}

          {/* 失败 - 编辑描述视图 */}
          {!isSuccess && editing && onRetryWithEdit && (
            <>
              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1.5 block">
                  调整任务描述
                </label>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[110px] text-[13px] rounded-xl resize-none"
                  placeholder="例如：把收件人改成 xxx@company.com、补充背景信息、限定回答格式…"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-9 rounded-xl text-[12px]"
                  onClick={() => setEditing(false)}
                >
                  返回
                </Button>
                <Button
                  disabled={!draft.trim()}
                  onClick={() => {
                    const v = draft.trim();
                    onOpenChange(false);
                    onRetryWithEdit(v);
                  }}
                  className="flex-1 h-9 rounded-xl text-[12px] bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2d3a5f] hover:to-[#324a8a] text-white"
                >
                  使用新描述重试
                </Button>
              </div>
            </>
          )}
        </div>

        {/* 关闭 */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/80 hover:bg-white border border-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </DialogContent>
    </Dialog>
  );
}