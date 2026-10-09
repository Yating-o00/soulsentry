import React, { useState } from "react";
import { Hand, ExternalLink, Undo2, Loader2 } from "lucide-react";

/** 人工接手区：用户打开界面亲自操作 / 修改邮件，完成后交还小助手 */
export default function AgentHandoffBox({ plan, busy, onReturn, forceTaken, onTake }) {
  const [taken, setLocalTaken] = useState(!!forceTaken);
  const setTaken = (v) => { setLocalTaken(v); onTake?.(); };
  const [note, setNote] = useState("");
  const [email, setEmail] = useState(() => {
    const e = plan.email || { subject: "", body: "" };
    return { ...e, to: /@/.test(e.to || "") ? e.to : "" };
  });
  const isEmail = plan.kind === "email";
  const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#384877]";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start gap-2">
        <Hand className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-900"><b>需要你接手：</b>{plan.handoff_reason}</div>
      </div>

      {!taken ? (
        <button onClick={() => { setTaken(true); if (!isEmail && plan.handoff_url) window.open(plan.handoff_url, "_blank"); }}
          className="mt-3 h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium flex items-center gap-1.5">
          {isEmail ? "我来接手，确认邮件" : <>{plan.handoff_action || "我来接手"}<ExternalLink className="w-3.5 h-3.5" /></>}
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          {isEmail ? (
            <>
              <input className={field} placeholder="收件人邮箱" value={email.to} onChange={(e) => setEmail({ ...email, to: e.target.value })} />
              <input className={field} placeholder="主题" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
              <textarea className={`${field} min-h-[140px]`} value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
            </>
          ) : (
            <>
              {plan.handoff_url && <a href={plan.handoff_url} target="_blank" rel="noreferrer" className="text-xs text-[#384877] underline break-all">{plan.handoff_url}</a>}
              <input className={field} placeholder="操作完告诉小助手结果，如：已订 MU587，¥6800" value={note} onChange={(e) => setNote(e.target.value)} />
            </>
          )}
          <button disabled={busy || (isEmail && (!email.to || !email.body))} onClick={() => onReturn({ note, email: isEmail ? email : null })}
            className="h-9 px-4 rounded-xl bg-[#384877] text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
            {isEmail ? "确认发送，交还小助手" : "我操作完了，交还小助手"}
          </button>
        </div>
      )}
    </div>
  );
}