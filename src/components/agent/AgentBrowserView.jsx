import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MousePointer2, Lock, RotateCw, Hand } from "lucide-react";

/** 模拟浏览器：展示小助手正在操作的网页，光标逐步「点击」，用户可随时接管 */
export default function AgentBrowserView({ plan, taken, onTakeover }) {
  const isEmail = plan.kind === "email";
  const url = isEmail ? "mail.google.com/mail/u/0/#compose" : (plan.handoff_url || "").replace(/^https?:\/\//, "") || "搜索中…";
  const agentSteps = plan.steps.filter((s) => s.actor === "agent");
  const [cur, setCur] = useState(0);
  const [shot, setShot] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    if (taken) return;
    const t = setInterval(() => setCur((c) => (c + 1) % Math.max(agentSteps.length, 1)), 1800);
    return () => clearInterval(t);
  }, [taken, agentSteps.length]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 border-b border-slate-200">
        <span className="flex gap-1"><i className="w-2.5 h-2.5 rounded-full bg-rose-400" /><i className="w-2.5 h-2.5 rounded-full bg-amber-400" /><i className="w-2.5 h-2.5 rounded-full bg-emerald-400" /></span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[11px] text-slate-500">
          <Lock className="w-3 h-3 shrink-0" /><span className="truncate">{url}</span>
          {!taken && <RotateCw className="w-3 h-3 ml-auto shrink-0 animate-spin text-[#384877]" />}
        </div>
        <button onClick={onTakeover} disabled={taken}
          className="no-min-size h-7 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium flex items-center gap-1 disabled:opacity-50 shrink-0">
          <Hand className="w-3 h-3" />{taken ? "已由你接管" : "随时接管"}
        </button>
      </div>

      <div className="relative p-3 max-h-72 overflow-auto">
        {!taken && agentSteps[cur] && (
          <div className="sticky top-0 z-10 mb-2 flex items-center gap-1.5 rounded-lg bg-[#384877] text-white px-2.5 py-1.5 text-[11px] shadow">
            <MousePointer2 className="w-3.5 h-3.5 animate-bounce" />小助手正在：{agentSteps[cur].name}
          </div>
        )}
        {isEmail && plan.email ? (
          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="border-b border-slate-100 pb-1"><span className="text-slate-400">收件人 </span>{/@/.test(plan.email.to || "") ? plan.email.to : "（待你填写）"}</div>
            <div className="border-b border-slate-100 pb-1"><span className="text-slate-400">主题 </span>{plan.email.subject}</div>
            <div className="whitespace-pre-wrap leading-relaxed">{plan.email.body}</div>
          </div>
        ) : (
          <>
            {plan.handoff_url && (
              <div className="mb-3 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                {!imgLoaded && <div className="h-40 flex items-center justify-center text-[11px] text-slate-400">正在加载真实网页画面…</div>}
                <img key={shot} src={`https://image.thum.io/get/width/1200/noanimate/${plan.handoff_url}?t=${shot}`} alt="网页实时画面"
                  onLoad={() => setImgLoaded(true)} onClick={onTakeover}
                  className={`w-full cursor-pointer ${imgLoaded ? "" : "hidden"}`} />
                <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-slate-500 border-t border-slate-200 bg-white">
                  <span>真实网页快照 · 点击画面即可接管操作</span>
                  <button onClick={() => { setImgLoaded(false); setShot(Date.now()); }} className="no-min-size text-[#384877] hover:underline">刷新画面</button>
                </div>
              </div>
            )}
            <div className="prose prose-sm max-w-none text-slate-700"><ReactMarkdown>{plan.findings}</ReactMarkdown></div>
          </>
        )}
      </div>
    </div>
  );
}