import { useState, useCallback } from "react";
import { useAICredits } from "./useAICredits";
import { AI_FEATURES } from "./creditConfig";

/**
 * Hook that gates AI feature usage behind credit checks.
 * Returns { gate, showInsufficientDialog, insufficientProps, dismissDialog }
 * 
 * Usage:
 *   const { gate, showInsufficientDialog, insufficientProps, dismissDialog } = useAICreditGate();
 *   
 *   const handleClick = async () => {
 *     const allowed = await gate("task_breakdown");
 *     if (!allowed) return; // dialog will show automatically
 *     // proceed with AI call...
 *   };
 */
export function useAICreditGate() {
  const { checkCredits, consumeCredits, refreshCredits, loading: creditsLoading } = useAICredits();
  const [showInsufficientDialog, setShowInsufficientDialog] = useState(false);
  const [insufficientProps, setInsufficientProps] = useState({ cost: 0, balance: 0, featureName: "" });

  /**
   * Check and consume credits for a feature.
   * Returns true if credits were deducted, false if insufficient.
   */
  const gate = useCallback(async (featureKey, description) => {
    const feature = AI_FEATURES[featureKey];
    if (!feature) {
      console.warn("Unknown AI feature:", featureKey);
      return true; // allow if feature not configured
    }

    // If credits are still loading, refresh and wait
    if (creditsLoading) {
      await refreshCredits();
    }

    const check = checkCredits(featureKey);
    if (!check.canUse) {
      setInsufficientProps({
        cost: check.cost,
        balance: check.balance,
        featureName: check.featureName,
      });
      setShowInsufficientDialog(true);
      return false;
    }

    const result = await consumeCredits(featureKey, description);
    if (!result.success) {
      setInsufficientProps({
        cost: feature.cost,
        balance: result.newBalance,
        featureName: feature.name,
      });
      setShowInsufficientDialog(true);
      return false;
    }

    return true;
  }, [checkCredits, consumeCredits]);

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