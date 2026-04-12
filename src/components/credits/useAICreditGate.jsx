import { useState, useCallback, useRef } from "react";
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
  const lastRefreshRef = useRef({ time: 0, balance: null });
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
      return true;
    }

    // Only refresh from server if last refresh was > 3 seconds ago to avoid rate limits
    const now = Date.now();
    let freshBalance;
    if (now - lastRefreshRef.current.time > 3000 || lastRefreshRef.current.balance === null) {
      const freshData = await refreshCredits();
      freshBalance = freshData?.credits ?? 0;
      lastRefreshRef.current = { time: now, balance: freshBalance };
    } else {
      freshBalance = lastRefreshRef.current.balance;
    }

    if (freshBalance < feature.cost) {
      setInsufficientProps({
        cost: feature.cost,
        balance: freshBalance,
        featureName: feature.name,
      });
      setShowInsufficientDialog(true);
      return false;
    }

    // Pass freshBalance to consumeCredits to avoid another me() call
    const result = await consumeCredits(featureKey, description, freshBalance);
    if (!result.success) {
      setInsufficientProps({
        cost: feature.cost,
        balance: result.newBalance,
        featureName: feature.name,
      });
      setShowInsufficientDialog(true);
      return false;
    }

    // Update cached balance after consumption
    lastRefreshRef.current = { time: Date.now(), balance: result.newBalance };
    return true;
  }, [consumeCredits, refreshCredits]);

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