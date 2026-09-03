import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Loader2 } from "lucide-react";
import AutomationResultPreview from "./AutomationResultPreview";
import { AUTOMATION_TYPES } from "./automationConfig";

// 约定卡片「验收」弹窗：直接呈现心栈做出的实质交付物（PPT/邮件/文档/账本…）
export default function AgreementDeliveryDialog({ open, onOpenChange, execution, onAccept, accepting }) {
  const result = execution?.automation_result;
  const cfg = AUTOMATION_TYPES[execution?.automation_type];
  const desc = execution?.automation_plan?.description || execution?.task_title || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 rounded-2xl flex flex-col max-h-[88vh] overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 px-6 pt-6 pb-5 border-b border-emerald-100/60">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-emerald-200/60 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[15px] font-bold text-slate-800 leading-tight">
                  {cfg ? `${cfg.emoji} ${cfg.label} · 请验收` : "请验收"}
                </DialogTitle>
                <DialogDescription className="text-[12px] text-slate-500 mt-0.5 line-clamp-2">
                  {desc}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 flex-1 overflow-y-auto">
          {result ? (
            <AutomationResultPreview
              result={result}
              automationType={execution?.automation_type}
              executionId={execution?.id}
            />
          ) : (
            <p className="text-[12.5px] text-slate-600 leading-relaxed">
              这次执行没有留下可查看的成果，建议重新交给心栈做一次。
            </p>
          )}
        </div>

        {onAccept && !execution?.user_feedback?.rated_at && (
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-2">
            <span className="text-[11.5px] text-slate-400 mr-auto">看过没问题就可以确认收下</span>
            <button
              type="button"
              onClick={onAccept}
              disabled={accepting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-emerald-600 text-white text-[12.5px] font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              {accepting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              没问题，验收完成
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}