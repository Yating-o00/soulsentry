import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, RotateCcw, Pencil, UserCog, X } from "lucide-react";

/**
 * 执行失败反馈弹窗：清晰告知失败原因，并提供三条出路
 *   1) 重试   2) 修改描述后重试   3) 人工接管（标记为手动处理）
 */
export default function ExecutionFailureDialog({
  open,
  onOpenChange,
  taskTitle = "",
  originalDesc = "",
  errorMessage = "",
  onRetry,         // (newDesc?: string) => void
  onTakeOver,      // () => void  人工接管
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(originalDesc || "");

  React.useEffect(() => {
    if (open) {
      setEditing(false);
      setDraft(originalDesc || "");
    }
  }, [open, originalDesc]);

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl">
        {/* 顶部色带 */}
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 px-6 pt-6 pb-5 border-b border-rose-100/60">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-rose-200/60 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[15px] font-bold text-slate-800 leading-tight">
                  AI 执行遇到困难
                </DialogTitle>
                <DialogDescription className="text-[12px] text-slate-500 mt-0.5 truncate">
                  {taskTitle || "自动执行任务"}
                </DialogDescription>
              </div>
            </div>
            {errorMessage && (
              <div className="text-[12px] text-rose-700 bg-white/70 border border-rose-200/60 rounded-lg px-3 py-2 leading-relaxed mt-2">
                {errorMessage}
              </div>
            )}
          </DialogHeader>
        </div>

        {/* 主体 */}
        <div className="px-6 py-5 space-y-3">
          {!editing ? (
            <>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                你可以选择下面的方式继续推进：
              </p>

              <button
                onClick={() => onRetry && onRetry()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-[#384877]/40 hover:bg-[#384877]/5 transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#384877]/10 flex items-center justify-center flex-shrink-0">
                  <RotateCcw className="w-4 h-4 text-[#384877]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800">原样重试</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">网络/接口波动时常常重试就能成功</div>
                </div>
              </button>

              <button
                onClick={() => setEditing(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-amber-400/60 hover:bg-amber-50 transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Pencil className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800">修改描述后重试</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">补充细节或换个说法让 AI 更好理解</div>
                </div>
              </button>

              <button
                onClick={() => onTakeOver && onTakeOver()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-emerald-400/60 hover:bg-emerald-50 transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <UserCog className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800">我来接管</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">标记为手动处理，AI 不再尝试</div>
                </div>
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-[12px] font-medium text-slate-700 mb-1.5 block">
                  调整任务描述
                </label>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[100px] text-[13px] rounded-xl resize-none"
                  placeholder="例如：把收件人改成 xxx@company.com、补充背景信息…"
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
                    onRetry && onRetry(draft.trim());
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
          onClick={handleClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/80 hover:bg-white border border-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </DialogContent>
    </Dialog>
  );
}