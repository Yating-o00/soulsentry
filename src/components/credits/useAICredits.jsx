import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { AI_FEATURES } from "./creditConfig";

export function useAICredits() {
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);

  const loadCredits = useCallback(async () => {
    const user = await base44.auth.me();
    const currentCredits = user.ai_credits ?? 200;
    const currentPlan = user.subscription_plan || "free";
    setCredits(currentCredits);
    setPlan(currentPlan);
    setLoading(false);
    return { credits: currentCredits, plan: currentPlan };
  }, []);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  /**
   * 检查是否有足够点数执行某个AI功能
   * @param {string} featureKey - AI功能键名
   * @returns {{ canUse: boolean, cost: number, balance: number, featureName: string }}
   */
  const checkCredits = useCallback((featureKey) => {
    const feature = AI_FEATURES[featureKey];
    if (!feature) {
      return { canUse: false, cost: 0, balance: credits || 0, featureName: "未知功能" };
    }
    return {
      canUse: (credits || 0) >= feature.cost,
      cost: feature.cost,
      balance: credits || 0,
      featureName: feature.name
    };
  }, [credits]);

  /**
   * 消耗点数
   * @param {string} featureKey - AI功能键名
   * @param {string} [description] - 可选的描述
   * @returns {Promise<{ success: boolean, newBalance: number, error?: string }>}
   */
  const consumeCredits = useCallback(async (featureKey, description) => {
    const feature = AI_FEATURES[featureKey];
    if (!feature) {
      return { success: false, newBalance: credits || 0, error: "未知的AI功能" };
    }

    // Re-read from server to avoid stale state / race conditions
    const user = await base44.auth.me();
    const currentCredits = user.ai_credits ?? 0;

    if (currentCredits < feature.cost) {
      setCredits(currentCredits);
      return { success: false, newBalance: currentCredits, error: `点数不足，需要 ${feature.cost} 点，当前余额 ${currentCredits} 点` };
    }

    const newBalance = currentCredits - feature.cost;

    // 更新用户点数
    await base44.auth.updateMe({ ai_credits: newBalance });
    setCredits(newBalance);

    // 记录交易
    await base44.entities.AICreditTransaction.create({
      type: "consume",
      amount: -feature.cost,
      balance_after: newBalance,
      feature: featureKey,
      description: description || `使用「${feature.name}」消耗 ${feature.cost} 点`
    });

    return { success: true, newBalance };
  }, []);

  /**
   * 增加点数（购买或赠送）
   * @param {number} amount - 增加的点数
   * @param {string} type - 交易类型
   * @param {string} description - 描述
   */
  const addCredits = useCallback(async (amount, type = "purchase", description = "") => {
    const currentCredits = credits ?? 0;
    const newBalance = currentCredits + amount;

    await base44.auth.updateMe({ ai_credits: newBalance });
    setCredits(newBalance);

    await base44.entities.AICreditTransaction.create({
      type,
      amount,
      balance_after: newBalance,
      description: description || `${type === "purchase" ? "购买" : "获得"} ${amount} 点`
    });

    return { success: true, newBalance };
  }, [credits]);

  return {
    credits,
    plan,
    loading,
    checkCredits,
    consumeCredits,
    addCredits,
    refreshCredits: loadCredits
  };
}