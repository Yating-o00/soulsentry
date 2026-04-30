import { useState, useCallback } from "react";
import { useAICredits } from "./useAICredits";

/**
 * Hook that gates AI feature usage behind a balance pre-check.
 * 动态计费模式：只校验余额是否 ≥ 1 点；真正扣费在后端基于 token 用量进行。
 *
 * Usage:
 *   const { gate, showInsufficientDialog, insufficientProps, dismissDialog } = useAICreditGate();
 *
 *   const handleClick = async () => {
 *     const allowed = await gate("task_breakdown");
 *     if (!allowed) return;
 *     // proceed with AI call (扣费由后端 callAI 完成)
 *   };
 */
const MIN_BALANCE = 1;

export function useAICreditGate() {
  const { refreshCredits } = useAICredits();
  const [showInsufficientDialog, setShowInsufficientDialog] = useState(false);
  const [insufficientProps, setInsufficientProps] = useState({ cost: 0, balance: 0, featureName: "" });

  const gate = useCallback(async (featureKey, _description) => {
    const freshData = await refreshCredits();
    const freshBalance = freshData?.credits ?? 0;

    if (freshBalance < MIN_BALANCE) {
      setInsufficientProps({
        cost: MIN_BALANCE,
        balance: freshBalance,
        featureName: "AI 服务",
      });
      setShowInsufficientDialog(true);
      return false;
    }
    return true;
  }, [refreshCredits]);

  const dismissDialog = useCallback(() => {
    setShowInsufficientDialog(false);
  }, []);

  return {
    gate,
    showInsufficientDialog,
    insufficientProps,
    dismissDialog,
    refreshCredits,
  };
}