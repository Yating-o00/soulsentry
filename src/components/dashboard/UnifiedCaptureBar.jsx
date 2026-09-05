import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Zap, Loader2, Link2, PlusCircle, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { routeCaptureIntent, CAPTURE_KINDS } from "@/lib/captureRouter";

export const CAPTURE_EVENT = "unified-capture";
export const CAPTURE_FOCUS_EVENT = "unified-capture-focus";

// 今日页顶部常驻输入细条：一个入口，AI 自动路由到任务编织 / 日程规划 / 设备协同
export default function UnifiedCaptureBar({ onTaskClick }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState(null); // "routing" | "dispatching"
  const [weaveResult, setWeaveResult] = useState(null);
  const [routedTo, setRoutedTo] = useState(null);
  const [lastInput, setLastInput] = useState("");
  const queryClient = useQueryClient();
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const focusHandler = () => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(CAPTURE_FOCUS_EVENT, focusHandler);
    return () => window.removeEventListener(CAPTURE_FOCUS_EVENT, focusHandler);
  }, []);

  const runWeave = async (input) => {
    const res = await base44.functions.invoke("weaveInputToTasks", { text: input });
    const data = res.data;
    if (data?.error) throw new Error(data.error);
    setWeaveResult(data);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const dispatchTo = async (kind, input) => {
    setRoutedTo(kind);
    setWeaveResult(null);
    setPhase("dispatching");
    try {
      if (kind === "weave") {
        await runWeave(input);
      } else {
        window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: { kind, text: input } }));
        toast.success(CAPTURE_KINDS[kind].hint, { icon: "✨" });
      }
    } catch (e) {
      toast.error("处理失败", { description: e?.message });
    } finally {
      setPhase(null);
    }
  };

  const handleSubmit = async () => {
    const input = text.trim();
    if (!input || phase) return;
    setPhase("routing");
    setWeaveResult(null);
    setLastInput(input);
    setText("");
    const kind = await routeCaptureIntent(input);
    await dispatchTo(kind, input);
  };

  const otherKinds = Object.keys(CAPTURE_KINDS).filter((k) => k !== routedTo);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 md:p-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const composing = e.nativeEvent && e.nativeEvent.isComposing;
            if (!composing && e.key === "Enter") handleSubmit();
          }}
          placeholder="说一件事 — 念头、日程安排、出行意图，AI 自动分发…"
          className="flex-1 bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400 min-w-0"
          disabled={!!phase}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || !!phase}
          className="no-min-size h-8 px-3 rounded-xl bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white text-xs font-medium flex items-center gap-1 disabled:opacity-40 transition-opacity shrink-0"
        >
          {phase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "发送"}
        </button>
      </div>

      {phase && (
        <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#384877]/5 border border-[#384877]/10">
          <Sparkles className="w-3.5 h-3.5 text-[#384877] shrink-0" />
          <span className="text-xs text-[#384877]">
            {phase === "routing" ? "识别中…" : `分发中 · ${CAPTURE_KINDS[routedTo]?.label || ""}`}
          </span>
        </div>
      )}

      {!phase && weaveResult && (
        <button
          onClick={() => { onTaskClick?.(weaveResult.task_id); setWeaveResult(null); }}
          className="mt-2.5 w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl bg-[#384877]/5 border border-[#384877]/15 hover:bg-[#384877]/10 transition-colors group"
        >
          {weaveResult.mode === "linked"
            ? <Link2 className="w-4 h-4 text-[#384877] shrink-0" />
            : <PlusCircle className="w-4 h-4 text-[#384877] shrink-0" />}
          <span className="text-xs text-slate-700 flex-1 min-w-0 truncate">{weaveResult.message}</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#384877] shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {!phase && routedTo && lastInput && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400">
            按「{CAPTURE_KINDS[routedTo].label}」处理，想换成：
          </span>
          {otherKinds.map((k) => (
            <button
              key={k}
              onClick={() => dispatchTo(k, lastInput)}
              className="no-min-size px-2 py-0.5 rounded-lg text-[11px] bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              {CAPTURE_KINDS[k].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}