import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Chip, ChipGroup, timeOptions, PRIORITY_OPTIONS } from "./SuggestionChips";
import AgreementDeliveryCard from "@/components/automation/AgreementDeliveryCard";
import { calibrationSentence, suggestedBufferMinutes } from "@/lib/calibration";
import { Undo2, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// 约定已经落定 —— 这里只做「微调」与「验收」，不需要填任何表单
export default function CreatedAgreementView({ task, context, triage, triaging, onUndo, onDone }) {
  const [current, setCurrent] = useState(task);
  const [appliedKeys, setAppliedKeys] = useState([]);
  const [busyKey, setBusyKey] = useState(null);
  const times = React.useMemo(() => timeOptions(), []);
  const calibration = context?.calibration;
  const template = context?.template;

  const mark = (key) => setAppliedKeys((prev) => [...prev, key]);

  const patch = async (key, data, message) => {
    setBusyKey(key);
    try {
      const updated = await base44.entities.Task.update(current.id, data);
      setCurrent(updated);
      mark(key);
      if (message) toast.success(message);
    } catch (e) {
      toast.error("调整失败，请重试");
    } finally {
      setBusyKey(null);
    }
  };

  const applyCalibration = async () => {
    const buffer = suggestedBufferMinutes(calibration?.average_offset_minutes);
    if (!buffer) return;
    const base = current.reminder_time ? new Date(current.reminder_time) : new Date();
    const shifted = new Date(base.getTime() - buffer * 60000).toISOString();
    await patch("calibration", { reminder_time: shifted }, "已按你的历史节奏留出缓冲");
  };

  const applyTemplate = async () => {
    if (!template?.steps?.length) return;
    setBusyKey("template");
    try {
      for (const step of template.steps) {
        await base44.entities.Task.create({
          title: step.title,
          description: [step.detail, step.offset_hint ? `时间提示：${step.offset_hint}` : ""].filter(Boolean).join("\n"),
          parent_task_id: current.id,
          status: "pending",
          category: current.category,
          priority: "medium",
        });
      }
      await base44.entities.PersonalTemplate.update(template.id, {
        use_count: (template.use_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      });
      mark("template");
      toast.success(`已套用「${template.name}」的 ${template.steps.length} 个步骤`);
    } catch (e) {
      toast.error("套用模板失败，请重试");
    } finally {
      setBusyKey(null);
    }
  };

  const reminderLabel = current.reminder_time
    ? format(new Date(current.reminder_time), "MM-dd HH:mm")
    : "未设时间";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 text-sm break-words">{current.title}</p>
          <p className="text-xs text-emerald-700 mt-1">已记下 · {reminderLabel}</p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500 shrink-0"
        >
          <Undo2 className="w-3.5 h-3.5" /> 撤销
        </button>
      </div>

      {(calibration || template || context?.profile?.persona) && (
        <ChipGroup title="它记得你">
          {template && (
            <Chip
              tone="template"
              label={`套用「${template.name}」${template.steps?.length || 0} 步`}
              applied={appliedKeys.includes("template")}
              busy={busyKey === "template"}
              onClick={applyTemplate}
            />
          )}
          {calibration && suggestedBufferMinutes(calibration.average_offset_minutes) > 0 && (
            <Chip
              tone="memory"
              label={calibrationSentence(calibration)}
              applied={appliedKeys.includes("calibration")}
              busy={busyKey === "calibration"}
              onClick={applyCalibration}
            />
          )}
          {context?.profile?.persona && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-500">
              {context.profile.persona}
            </span>
          )}
        </ChipGroup>
      )}

      <ChipGroup title="时间">
        {times.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            applied={appliedKeys.includes(t.key)}
            busy={busyKey === t.key}
            onClick={() => patch(t.key, { reminder_time: t.value, time_is_suggested: false })}
          />
        ))}
      </ChipGroup>

      <ChipGroup title="优先级">
        {PRIORITY_OPTIONS.map((p) => (
          <Chip
            key={p.key}
            label={p.label}
            applied={current.priority === p.key}
            busy={busyKey === p.key}
            onClick={() => patch(p.key, { priority: p.key })}
          />
        ))}
      </ChipGroup>

      <ChipGroup title="提醒">
        <Chip
          label="提前 30 分钟提醒我"
          applied={appliedKeys.includes("advance30")}
          busy={busyKey === "advance30"}
          onClick={() => patch("advance30", { advance_reminders: [30] })}
        />
        <Chip
          label="提前一天提醒我"
          applied={appliedKeys.includes("advance1d")}
          busy={busyKey === "advance1d"}
          onClick={() => patch("advance1d", { advance_reminders: [1440] })}
        />
      </ChipGroup>

      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-[#384877]" />
          <span className="text-xs font-semibold text-slate-600">心栈已替你动手的部分</span>
          {triaging && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>
        {triaging ? (
          <p className="text-xs text-slate-400">正在判断哪些部分可以直接交给机器…</p>
        ) : triage && (triage.machine_parts?.length || triage.human_parts?.length) ? (
          <AgreementDeliveryCard
            machineParts={triage.machine_parts}
            humanParts={triage.human_parts}
            summary={triage.summary}
          />
        ) : (
          <p className="text-xs text-slate-400">这件事只有你能完成，心栈会准时提醒你。</p>
        )}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full py-3 rounded-2xl bg-[#384877] text-white text-sm font-medium hover:bg-[#2f3d66] transition-colors"
      >
        完成
      </button>
    </div>
  );
}