import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCachedUser } from "@/lib/userCache";
import { Coins, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CreditsBadge({ compact = false }) {
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    const load = (forceRefresh = false) => {
      getCachedUser(forceRefresh).then(user => {
        setCredits(user.ai_credits ?? 200);
        setPlan(user.subscription_plan || "free");
      }).catch(() => {});
    };
    load();

    const handleUpdate = (e) => {
      if (e.detail?.credits != null) {
        setCredits(e.detail.credits);
        if (e.detail.plan) setPlan(e.detail.plan);
      } else {
        load(true);
      }
    };
    window.addEventListener("credits-updated", handleUpdate);
    return () => window.removeEventListener("credits-updated", handleUpdate);
  }, []);

  if (credits === null) return null;

  const isLow = credits < 100;
  const planLabel = plan === "pro" ? "Pro" : plan === "team" ? "Team" : null;

  if (compact) {
    return (
      <Link to={createPageUrl("Pricing")} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-[#384877] text-xs font-medium no-min-size">
        <Coins className="w-3.5 h-3.5" />
        <span>{credits}</span>
      </Link>
    );
  }

  return (
    <Link to={createPageUrl("Pricing")} className="block no-min-size">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        isLow 
          ? "bg-rose-50 hover:bg-rose-100 border border-rose-200" 
          : "bg-gradient-to-r from-slate-50 to-blue-50 hover:from-slate-100 hover:to-blue-100 border border-slate-200"
      }`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
          isLow ? "bg-rose-100" : "bg-[#384877]/10"
        }`}>
          <Coins className={`w-5 h-5 ${isLow ? "text-rose-600" : "text-[#384877]"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${isLow ? "text-rose-700" : "text-slate-800"}`}>
              {credits} 点
            </span>
            {planLabel && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#384877] text-white">
                {planLabel}
              </span>
            )}
          </div>
          <p className={`text-[11px] ${isLow ? "text-rose-500" : "text-slate-500"}`}>
            {isLow ? "余额不足，点击充值" : "AI 点数余额"}
          </p>
        </div>
        <TrendingUp className={`w-4 h-4 ${isLow ? "text-rose-400" : "text-slate-400"}`} />
      </div>
    </Link>
  );
}