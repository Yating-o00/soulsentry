import React, { useState } from "react";
import Welcome from "@/pages/Welcome";

// Helper for safe localStorage access
const getStorageItem = (key) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    // Ignore errors (e.g. privacy mode)
  }
  return null;
};

const setStorageItem = (key, value) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    // Ignore errors
  }
};

export default function WelcomeGuard({ children }) {
  // Initialize state synchronously to avoid white flash
  const [showWelcome, setShowWelcome] = useState(() => {
    const completed = getStorageItem("soul_sentry_welcome_completed_v1");
    return !completed;
  });

  const handleComplete = () => {
    setStorageItem("soul_sentry_welcome_completed_v1", "true");
    setShowWelcome(false);
  };

  if (showWelcome) {
    return <Welcome onComplete={handleComplete} />;
  }

  return children;
}