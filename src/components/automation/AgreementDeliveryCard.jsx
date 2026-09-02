import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { AUTOMATION_TYPES } from "@/components/automation/automationConfig";
import { TIERS } from "@/lib/trustLadder";
import { CheckCircle2, Play, Loader2, AlertCircle, ExternalLink, User } from "lucide-react";
import { toast } from "sonner";

// 约定即交付：把「机器已兑现的部分」呈现为「已完成，请验收」，
// 需确认的部分呈现为「可一键执行」，人做的部分单独列出。
export default function AgreementDeliveryCard({ machineParts = [], humanParts = [], summary }) {
  const [parts, setParts] = useState(machineParts);
  const [runningId, setRunningId] = useState(null);

  React.useEffect(() => setParts(machineParts), [machineParts]);

  const runNow = async (part, index) => {
    if (!part.execution_id) return;
    setRunningId(part.execution_id);
    try {
      await base44.functions.invoke("executeAutomation", {
        execution_id: part.execution_id,
        phase: "execute",
      });
      setParts((prev) => prev.map((p, i) => (i === index ? { ...p, state: "delivered" } : p)));
      toast.success("已替你完成，请验收");
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "执行失败";
      toast.error(msg);
      setParts((prev) => prev.map((p, i) => (i === index ? { ...p, state: "failed", error: msg } : p)));
    } finally {
      setRunningId(null);
    }
  };

  if (parts.length === 0 && humanParts.length === 0) return null;

  return (
    <div className="space-y-3">
      {summary && <p className="text-sm text-slate-500 leading-relaxed">{summary}</p>}

      {parts.map((part, index) => {
        const cfg = AUTOMATION_TYPES[part.automation_type] || { label: part.automation_type, emoji: "⚙️" };
        const delivered = part.state === "delivered";
        const failed = part.state === "failed";
        const tierCfg = TIERS[part.tier] || TIERS.confirm_first;
        return (
          <div
            key={part.execution_id || index}
            className={`p-4 rounded-2xl border transition-all ${
              delivered
                ? "bg-emerald-50/70 border-emerald-200"
                : failed
                ? "bg-rose-50/70 border-rose-200"
                : "bg-white border-slate-200"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {delivered ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : failed ? (
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                ) : (
                  <span className="text-base leading-5">{cfg.emoji}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-slate-800">{part.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${tierCfg.color}`}>
                    {cfg.label} · {tierCfg.short}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{part.detail}</p>
                {failed && part.error && (
                  <p className="text-xs text-rose-600 mt-1.5 leading-relaxed">{part.error}</p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  {delivered ? (
                    <span className="text-xs font-medium text-emerald-700">已完成，请验收</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => runNow(part, index)}
                      disabled={runningId === part.execution_id || !part.execution_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#384877] text-white text-xs font-medium hover:bg-[#2f3d66] transition-colors disabled:opacity-50"
                    >
                      {runningId === part.execution_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      一键执行
                    </button>
                  )}
                  {part.execution_id && (
                    <a
                      href="/Notifications"
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-[#384877]"
                    >
                      查看成果 <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {humanParts.length > 0 && (
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">这几件只有你能做</span>
          </div>
          <ul className="space-y-1.5">
            {humanParts.map((h, i) => (
              <li key={i} className="text-xs text-slate-600 leading-relaxed">
                · {h.title}
                {h.time_hint ? <span className="text-slate-400"> （{h.time_hint}）</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}