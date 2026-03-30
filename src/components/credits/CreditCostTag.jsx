import React from "react";
import { Coins } from "lucide-react";
import { AI_FEATURES } from "./creditConfig";

/**
 * 在AI功能按钮旁显示点数消耗标签
 * @param {{ featureKey: string, className?: string }} props
 */
export default function CreditCostTag({ featureKey, className = "" }) {
  const feature = AI_FEATURES[featureKey];
  if (!feature) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md ${className}`}>
      <Coins className="w-3 h-3" />
      {feature.cost}
    </span>
  );
}