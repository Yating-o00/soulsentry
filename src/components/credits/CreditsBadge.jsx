import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Coins, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CreditsBadge({ compact = false }) {
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    base44.auth.me().then(user => {
      setCredits(user.ai_credits ?? 200);
      setPlan(user.subscription_plan || "free");
    }).catch(() => {});
  }, []);

  if (credits === null) return null;

  const isLow = credits < 100;
  const planLabel = plan === "pro" ? "Pro" : plan === "team" ? "Team" : null;

  if (compact) {
    return (
      <Link to={createPageUrl("Pricing")} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors text-amber-700 text-xs font-medium no-min-size">
        <Coins className="w-3.5 h-3.5" />
        <span>{credits}</span>
      </Link>
    );
  }

  return (
    <Link to={createPageUrl("Pricing")} className="block no-min-size">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        isLow 
          ? "bg-red-50 hover:bg-red-100 border border-red-200" 
          : "bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200"
      }`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
          isLow ? "bg-red-100" : "bg-amber-100"
        }`}>
          <Coins className={`w-5 h-5 ${isLow ? "text-red-600" : "text-amber-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${isLow ? "text-red-700" : "text-amber-800"}`}>
              {credits} 点
            </span>
            {planLabel && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#384877] text-white">
                {planLabel}
              </span>
            )}
          </div>
          <p className={`text-[11px] ${isLow ? "text-red-500" : "text-amber-600"}`}>
            {isLow ? "余额不足，点击充值" : "AI 点数余额"}
          </p>
        </div>
        <TrendingUp className={`w-4 h-4 ${isLow ? "text-red-400" : "text-amber-400"}`} />
      </div>
    </Link>
  );
}