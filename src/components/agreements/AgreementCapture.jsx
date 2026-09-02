import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Loader2, CornerDownLeft } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import CaptureSteps from "./CaptureSteps";
import CaptureResult from "./CaptureResult";
import { toast } from "sonner";

// 零摩擦捕获：唯一的输入口，说一句就落定，四步解析逐步点亮
export default function AgreementCapture() {
  const [text, setText] = useState("");
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();

  const { isListening, toggle, stop, supported } = useVoiceInput((chunk) => {
    setText((prev) => (prev ? `${prev}${chunk}` : chunk));
  });

  React.useEffect(() => {
    const focus = () => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => inputRef.current?.focus(), 300);
    };
    window.addEventListener("mobile-create-task", focus);
    return () => window.removeEventListener("mobile-create-task", focus);
  }, []);

  const submit = async () => {
    const raw = text.trim();
    if (!raw || running) return;
    setRunning(true);
    setResult(null);
    stop();

    try {
      // ① 时间与意图
      setStep(1);
      let parsed = null;
      try {
        const res = await base44.functions.invoke("parseNaturalTime", { input: raw });
        parsed = res?.data || null;
      } catch (_) {
        parsed = null;
      }
      const title = (parsed?.title_hint || raw).replace(/\s+/g, " ").slice(0, 60);
      const task = await base44.entities.Task.create({
        title,
        description: raw.length > 60 ? raw : "",
        reminder_time: parsed?.reminder_time || undefined,
        end_time: parsed?.end_time || undefined,
        is_all_day: !!parsed?.is_all_day,
        time_is_suggested: !parsed?.reminder_time,
        status: "pending",
        priority: "medium",
      });

      // ② 事项链路 + ④ 预执行（分诊同时把机器能做的先做掉）
      setStep(2);
      let triage = null;
      try {
        const r = await base44.functions.invoke("triageAgreement", { task_id: task.id });
        triage = r?.data || null;
      } catch (_) {
        triage = null;
      }

      const chain = [];
      for (const part of triage?.human_parts || []) {
        try {
          const sub = await base44.entities.Task.create({
            title: part.title,
            description: [part.detail, part.time_hint ? `时间提示：${part.time_hint}` : ""]
              .filter(Boolean)
              .join("\n"),
            parent_task_id: task.id,
            status: "pending",
            category: task.category,
            priority: "medium",
          });
          chain.push(sub);
        } catch (_) {
          /* 单条失败不影响整体 */
        }
      }

      // ③ 记忆画像
      setStep(3);
      let context = null;
      try {
        const r = await base44.functions.invoke("getAgreementContext", { draft: raw });
        context = r?.data || null;
      } catch (_) {
        context = null;
      }

      setStep(4);
      setResult({ task, chain, triage, context });
      setText("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setTimeout(() => setStep(0), 900);
    } catch (e) {
      toast.error("没有记下来，请再说一次");
      setStep(0);
    } finally {
      setRunning(false);
    }
  };

  const undo = async () => {
    if (!result?.task) return;
    try {
      await Promise.all([
        ...result.chain.map((c) => base44.entities.Task.delete(c.id)),
        base44.entities.Task.delete(result.task.id),
      ]);
      setResult(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("已撤销");
    } catch (_) {
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
    <section id="mobile-task-create-anchor" className="scroll-mt-20" data-tour="task-create">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <p className="text-sm text-slate-500 mb-3">说出一个约定，剩下的交给心栈</p>
        <div className="rounded-2xl border border-slate-200 focus-within:border-[#384877]/50 focus-within:ring-4 focus-within:ring-[#384877]/10 transition-all p-4">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder="例如：下周三飞上海出差两天"
            className="w-full bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between mt-2">
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
              disabled={!text.trim() || running}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#384877] text-white text-xs font-medium hover:bg-[#2f3d66] transition-colors disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CornerDownLeft className="w-3.5 h-3.5" />
              )}
              {running ? "正在落定" : "交给心栈"}
            </button>
          </div>
        </div>

        <CaptureSteps current={step} />

        {result && (
          <CaptureResult
            task={result.task}
            chain={result.chain}
            triage={result.triage}
            context={result.context}
            onUndo={undo}
            onClose={() => setResult(null)}
          />
        )}
      </div>
    </section>
  );
}