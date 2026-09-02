import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Mic, MicOff, Loader2, CornerDownLeft } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import CreatedAgreementView from "./CreatedAgreementView";
import { toast } from "sonner";

// 唯一的创建入口：说话或打字 → 零确认落地 → 微调 chip → 可撤销
export default function GlobalCreatePanel({ open, onOpenChange }) {
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [task, setTask] = useState(null);
  const [context, setContext] = useState(null);
  const [triage, setTriage] = useState(null);
  const [triaging, setTriaging] = useState(false);
  const inputRef = useRef(null);

  const { isListening, toggle, stop, supported } = useVoiceInput((chunk) => {
    setText((prev) => (prev ? `${prev}${chunk}` : chunk));
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      stop();
      setText("");
      setTask(null);
      setContext(null);
      setTriage(null);
      setTriaging(false);
    }
  }, [open]);

  const submit = async () => {
    const raw = text.trim();
    if (!raw || creating) return;
    setCreating(true);
    stop();
    try {
      let parsed = null;
      try {
        const res = await base44.functions.invoke("parseNaturalTime", { input: raw });
        parsed = res?.data || null;
      } catch (e) {
        parsed = null;
      }

      const title = (parsed?.title_hint || raw).replace(/\s+/g, " ").slice(0, 60);
      const created = await base44.entities.Task.create({
        title,
        description: raw.length > 60 ? raw : "",
        reminder_time: parsed?.reminder_time || undefined,
        end_time: parsed?.end_time || undefined,
        is_all_day: !!parsed?.is_all_day,
        time_is_suggested: !parsed?.reminder_time,
        status: "pending",
        priority: "medium",
      });
      setTask(created);

      base44.functions
        .invoke("getAgreementContext", { draft: raw })
        .then((r) => setContext(r?.data || null))
        .catch(() => setContext(null));

      setTriaging(true);
      base44.functions
        .invoke("triageAgreement", { task_id: created.id })
        .then((r) => setTriage(r?.data || null))
        .catch(() => setTriage(null))
        .finally(() => setTriaging(false));
    } catch (e) {
      toast.error("创建失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  const undo = async () => {
    if (!task) return;
    try {
      await base44.entities.Task.delete(task.id);
      toast.success("已撤销");
      onOpenChange(false);
    } catch (e) {
      toast.error("撤销失败");
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[88vh] overflow-y-auto rounded-3xl p-6 md:p-8">
        {!task ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">记一件事</h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              说一句或打一句就好，其余的心栈来安排。
            </p>

            <div className="mt-5 rounded-2xl border border-slate-200 focus-within:border-[#384877]/50 focus-within:ring-4 focus-within:ring-[#384877]/10 transition-all p-4">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={4}
                placeholder="例如：下周三下午两点和张琛过一遍 BP，提前把初稿发给他"
                className="w-full bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between mt-3">
                {supported ? (
                  <button
                    type="button"
                    onClick={toggle}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      isListening
                        ? "bg-rose-50 text-rose-600 border-rose-200"
                        : "bg-white text-slate-500 border-slate-200 hover:text-[#384877]"
                    }`}
                  >
                    {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    {isListening ? "停止说话" : "说给它听"}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={!text.trim() || creating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#384877] text-white text-xs font-medium hover:bg-[#2f3d66] transition-colors disabled:opacity-40"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
                  {creating ? "正在落定" : "记下"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <CreatedAgreementView
            task={task}
            context={context}
            triage={triage}
            triaging={triaging}
            onUndo={undo}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}