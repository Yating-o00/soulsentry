import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getCachedUser } from "@/lib/userCache";

export function useAICredits() {
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);

  const loadCredits = useCallback(async (forceRefresh = false) => {
    const user = await getCachedUser(forceRefresh);
    const currentCredits = user.ai_credits ?? 200;
    const currentPlan = user.subscription_plan || "free";
    setCredits(currentCredits);
    setPlan(currentPlan);
    setLoading(false);
    if (forceRefresh) {
      window.dispatchEvent(new CustomEvent("credits-updated", { detail: { credits: currentCredits, plan: currentPlan } }));
    }
    return { credits: currentCredits, plan: currentPlan };
  }, []);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  /**
   * 检查是否有足够点数（动态计费下：余额 ≥ 1 即可调用）
   */
  const checkCredits = useCallback(() => {
    return {
      canUse: (credits || 0) >= 1,
      cost: 1,
      balance: credits || 0,
      featureName: "AI 服务"
    };
  }, [credits]);

  /**
   * 消耗点数（动态计费下：实际扣费由后端 callAI 完成；
   * 此函数仅在前端做余额预检 + 同步缓存，保持向后兼容）
   */
  const consumeCredits = useCallback(async (featureKey, _description, knownBalance) => {
    const currentCredits = knownBalance ?? credits ?? 0;
    if (currentCredits < 1) {
      setCredits(currentCredits);
      return { success: false, newBalance: currentCredits, error: "AI 点数不足，请前往「AI 点数」页面充值" };
    }
    return { success: true, newBalance: currentCredits };
  }, [credits]);

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