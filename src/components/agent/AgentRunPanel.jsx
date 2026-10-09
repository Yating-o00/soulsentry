import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Check, User, Loader2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { planAgentRun, finishAgentRun, reviseAgentRun } from "@/lib/agentRunner";
import AgentHandoffBox from "./AgentHandoffBox";
import AgentChatBox from "./AgentChatBox";

/** 小助手执行面板：自动做能做的 → 卡点人工接手 → 交还收尾 */
export default function AgentRunPanel({ command, onClose }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [history, setHistory] = useState([]);
  const [revising, setRevising] = useState(false);
  const [rev, setRev] = useState(0);

  const handleChat = async (message) => {
    setHistory((h) => [...h, { role: "user", text: message }]);
    setRevising(true);
    try {
      const { reply, ...next } = await reviseAgentRun(command, plan, history, message);
      setPlan(next);
      setRev((r) => r + 1);
      setHistory((h) => [...h, { role: "agent", text: reply }]);
    } catch (e) {
      toast.error("小助手没能完成修改", { description: e?.message });
    } finally {
      setRevising(false);
    }
  };

  useEffect(() => {
    planAgentRun(command).then(setPlan).catch((e) => { toast.error("小助手执行失败", { description: e?.message }); onClose(); });
  }, [command]);

  const handleReturn = async ({ note, email }) => {
    setBusy(true);
    try {
      if (email) {
        const res = await base44.functions.invoke("sendGmailEmail", email);
        if (res.data?.error) throw new Error(res.data.error);
      }
      const summary = await finishAgentRun(command, plan, email ? `已确认并发送给 ${email.to}` : note);
      await base44.entities.Task.create({ title: plan.title, description: `${summary}\n\n${note || ""}`.trim(), status: "completed", completed_at: new Date().toISOString(), category: "personal" });
      setDone(summary);
    } catch (e) {
      toast.error("交还失败", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-[#384877]/15 bg-slate-50/80 p-4 text-left">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-[#384877]" />
        <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{plan?.title || command}</span>
        <button onClick={onClose} className="no-min-size p-1 rounded-lg hover:bg-slate-200"><X className="w-4 h-4 text-slate-400" /></button>
      </div>

      {!plan ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />小助手正在联网查询并执行，约需 20–40 秒…</div>
      ) : (
        <div className="mt-3 space-y-3">
          <ol className="space-y-1.5">
            {plan.steps.map((s, i) => {
              const finished = s.actor === "agent" || done;
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${finished ? "bg-emerald-500 text-white" : "bg-amber-400 text-white"}`}>
                    {finished ? <Check className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                  </span>
                  <span className="text-slate-700"><b>{s.name}</b>{s.actor === "human" && <span className="text-amber-600"> · 你来</span>}<span className="text-slate-500"> — {s.detail}</span></span>
                </li>
              );
            })}
          </ol>
          <div className="prose prose-sm max-w-none text-slate-700 bg-white rounded-xl border border-slate-200 p-3 max-h-72 overflow-auto">
            <ReactMarkdown>{plan.findings}</ReactMarkdown>
          </div>
          {done ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /><div><b>完成 · </b>{done}</div>
            </div>
          ) : (
            <>
              <AgentChatBox history={history} busy={revising} onSend={handleChat} />
              <AgentHandoffBox key={rev} plan={plan} busy={busy || revising} onReturn={handleReturn} />
            </>
          )}
        </div>
      )}
    </div>
  );
}