import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { TIERS, TIER_ORDER, DEFAULT_TIERS, TRUST_TYPE_NOTE, TRUST_TYPE_LABEL, TRUST_TYPE_EMOJI, tierOf } from "@/lib/trustLadder";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPE_KEYS = Object.keys(DEFAULT_TIERS);

export default function TrustLadderPanel() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(null);

  useEffect(() => {
    base44.entities.TrustPolicy.list("-updated_date", 30)
      .then((rows) => setPolicies(rows || []))
      .finally(() => setLoading(false));
  }, []);

  const setTier = async (automation_type, tier) => {
    setSavingType(automation_type);
    try {
      const hit = policies.find((p) => p.automation_type === automation_type);
      const saved = hit
        ? await base44.entities.TrustPolicy.update(hit.id, { tier })
        : await base44.entities.TrustPolicy.create({ automation_type, tier });
      setPolicies((prev) => {
        const rest = prev.filter((p) => p.automation_type !== automation_type);
        return [saved, ...rest];
      });
      toast.success(`「${TRUST_TYPE_LABEL[automation_type] || automation_type}」已设为${TIERS[tier].label}`);
    } catch (e) {
      toast.error("保存失败，请重试");
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-[#384877]/10 text-[#384877] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">信任阶梯</h2>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
            每一类事，你清楚知道心栈现在能替你做到哪一步。改动即时生效，影响之后所有同类约定。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {TIER_ORDER.map((k) => (
          <div key={k} className={`px-3 py-2 rounded-xl border text-xs leading-relaxed ${TIERS[k].color}`}>
            <span className="font-semibold">{TIERS[k].label}</span>
            <span className="opacity-70"> · {TIERS[k].description}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> 读取你的托管设置…
        </div>
      ) : (
        <div className="space-y-3">
          {TYPE_KEYS.map((type) => {
            const cfg = { label: TRUST_TYPE_LABEL[type] || type, emoji: TRUST_TYPE_EMOJI[type] || "⚙️" };
            const current = tierOf(policies, type);
            return (
              <div
                key={type}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/60"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cfg.emoji}</span>
                    <span className="font-medium text-slate-800 text-sm">{cfg.label}</span>
                    {savingType === type && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{TRUST_TYPE_NOTE[type]}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {TIER_ORDER.map((k) => {
                    const active = current === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => !active && setTier(type, k)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          active
                            ? TIERS[k].color + " shadow-sm"
                            : "bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                        }`}
                      >
                        {TIERS[k].short}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}