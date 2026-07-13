import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Zap, Loader2, Link2, PlusCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

// 流式行动输入：碎片想法 → AI 实时编织进现有任务链或创建新约定
export default function FlowCaptureBar({ onTaskClick }) {
  const [text, setText] = useState("");
  const [weaving, setWeaving] = useState(false);
  const [result, setResult] = useState(null);
  const queryClient = useQueryClient();

  const handleWeave = async () => {
    const input = text.trim();
    if (!input || weaving) return;
    setWeaving(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("weaveInputToTasks", { text: input });
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setText("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      toast.error("编织失败", { description: e?.message });
    } finally {
      setWeaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 md:p-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleWeave(); }}
          placeholder="随手记一个念头，AI 自动编织进你的任务链…"
          className="flex-1 bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400 min-w-0"
          disabled={weaving}
        />
        <button
          onClick={handleWeave}
          disabled={!text.trim() || weaving}
          className="no-min-size h-8 px-3 rounded-xl bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white text-xs font-medium flex items-center gap-1 disabled:opacity-40 transition-opacity shrink-0"
        >
          {weaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "编织"}
        </button>
      </div>

      {result && (
        <button
          onClick={() => { onTaskClick?.(result.task_id); setResult(null); }}
          className="mt-2.5 w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl bg-[#384877]/5 border border-[#384877]/15 hover:bg-[#384877]/10 transition-colors group"
        >
          {result.mode === "linked"
            ? <Link2 className="w-4 h-4 text-[#384877] shrink-0" />
            : <PlusCircle className="w-4 h-4 text-[#384877] shrink-0" />}
          <span className="text-xs text-slate-700 flex-1 min-w-0 truncate">{result.message}</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#384877] shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}