import { useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";

const TRIAL_PREFIX = "ss_trial_v1_";
const DEMO_EMAIL = "demo@soulsentry.local";

function getStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function isDemoUser(user) {
  if (!user) return true;
  return user.email === DEMO_EMAIL || user.role === "demo";
}

export function useTrialGate() {
  const { user, isAuthenticated } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptFeature, setPromptFeature] = useState("");

  const checkTrial = useCallback((featureKey, featureName) => {
    const isDemo = isDemoUser(user);
    if (!isDemo && isAuthenticated) {
      return true;
    }

    const storageKey = `${TRIAL_PREFIX}${featureKey}`;
    const used = getStorage(storageKey);

    if (!used) {
      setStorage(storageKey, "1");
      return true;
    }

    setPromptFeature(featureName || featureKey);
    setShowPrompt(true);
    return false;
  }, [user, isAuthenticated]);

  const closePrompt = useCallback(() => {
    setShowPrompt(false);
    setPromptFeature("");
  }, []);

  return {
    checkTrial,
    showPrompt,
    promptFeature,
    closePrompt,
    isDemoUser: isDemoUser(user)
  };
}
