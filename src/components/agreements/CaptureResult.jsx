import React from "react";
import AgreementDeliveryCard from "@/components/automation/AgreementDeliveryCard";
import { calibrationSentence } from "@/lib/calibration";
import { Undo2, CheckCircle2, CornerDownRight, Sparkles } from "lucide-react";
import { format } from "date-fns";

// 约定落定后的即时回执：兑现链路 + 已预执行的部分 + 记忆画像一句话
export default function CaptureResult({ task, chain = [], triage, context, onUndo, onClose }) {
  const reminderLabel = task?.reminder_time
    ? format(new Date(task.reminder_time), "MM-dd HH:mm")
    : "时间待定";
  const memoryLine = context?.calibration ? calibrationSentence(context.calibration) : "";

  return (
    <div className="mt-5 rounded-2xl border border-[#6B8E23]/25 bg-[#f7faf2] p-5 space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#6B8E23] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 break-words">{task?.title}</p>
          <p className="text-xs text-[#4d6619] mt-1">已成为约定 · {reminderLabel}</p>
          {memoryLine && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#6B8E23]" /> {memoryLine}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500 shrink-0"
        >
          <Undo2 className="w-3.5 h-3.5" /> 撤销
        </button>
      </div>

      {chain.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">兑现链路</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {chain.map((step, i) => (
              <React.Fragment key={step.id || i}>
                {i > 0 && <CornerDownRight className="w-3 h-3 text-slate-300" />}
                <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  {step.title}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {triage && (triage.machine_parts?.length > 0 || triage.human_parts?.length > 0) ? (
        <AgreementDeliveryCard
          machineParts={triage.machine_parts}
          humanParts={[]}
          summary={triage.summary}
        />
      ) : (
        <p className="text-xs text-slate-500">这件事只有你能完成，心栈会准时提醒你。</p>
      )}

      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-[#384877] text-white text-sm font-medium hover:bg-[#2f3d66] transition-colors"
      >
        知道了
      </button>
    </div>
  );
}