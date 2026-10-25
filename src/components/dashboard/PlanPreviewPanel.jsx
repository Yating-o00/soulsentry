import React, { useState } from "react";
import { Loader2, Check, X, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reviseAgreementPlan, commitAgreementPlan } from "@/lib/agreementPlanner";
import PlanStepList from "./PlanStepList";

// 规划预览：可多轮对话修改，确认后才写入约定
export default function PlanPreviewPanel({ draft: initial, onDone, onCancel }) {
  const [draft, setDraft] = useState(initial);
  const [history, setHistory] = useState(initial.reply ? [{ role: "ai", text: initial.reply }] : []);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(null);

  const send = async () => {
    const text = msg.trim();
    if (!text || busy) return;
    const next = [...history, { role: "user", text }];
    setHistory(next); setMsg(""); setBusy("revise");
    try {
      const d = await reviseAgreementPlan(draft, next);
      setDraft(d);
      setHistory([...next, { role: "ai", text: d.reply || "已按你的意见调整" }]);
    } catch (e) {
      toast.error("修改失败", { description: e?.message });
    } finally { setBusy(null); }
  };

  const confirm = async () => {
    setBusy("commit");
    try { onDone(await commitAgreementPlan(draft)); }
    catch (e) { toast.error("写入失败", { description: e?.message }); setBusy(null); }
  };

  return (
    <div className="mt-3 rounded-2xl border border-[#384877]/15 bg-white p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-amber-700">预览版 · 尚未写入约定</p>
          <h4 className="font-semibold text-slate-800">{draft.title}</h4>
          {draft.overview && <p className="text-xs text-slate-500 mt-0.5">{draft.overview}</p>}
        </div>
        <button onClick={onCancel} className="no-min-size p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      <PlanStepList steps={draft.steps} />
      {history.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-auto">
          {history.map((m, i) => (
            <p key={i} className={`text-xs px-2.5 py-1.5 rounded-xl w-fit max-w-[90%] ${m.role === "user" ? "ml-auto bg-[#384877] text-white" : "bg-slate-100 text-slate-700"}`}>{m.text}</p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} disabled={!!busy}
          onKeyDown={(e) => { if (!e.nativeEvent.isComposing && e.key === "Enter") send(); }}
          placeholder="想怎么调整？如：周末不练、改到晚上 7 点、强度低一点"
          className="flex-1 min-w-0 text-sm px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-[#384877]" />
        <Button size="icon" variant="outline" onClick={send} disabled={!msg.trim() || !!busy}>
          {busy === "revise" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      <Button className="w-full" onClick={confirm} disabled={!!busy}>
        {busy === "commit" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        确认并写入约定（{draft.steps.length} 个子约定，到点自动提醒）
      </Button>
    </div>
  );
}