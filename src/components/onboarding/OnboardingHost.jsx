import React, { useState, useEffect } from "react";
import OnboardingModal from "./OnboardingModal";
import { useAuth } from "@/lib/AuthContext";

const TOUR_KEY = "ss_tour_completed_v1";
const NEW_USER_WINDOW_MS = 48 * 60 * 60 * 1000;

export default function OnboardingHost() {
  const { user, isAuthenticated } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_KEY)) return;
    } catch {}

    if (!isAuthenticated || !user) return;

    const isDemo = user.email === "demo@soulsentry.local" || user.role === "demo";

    const createdAt = user.created_date ? new Date(user.created_date).getTime() : 0;
    const isNewUser = Date.now() - createdAt < NEW_USER_WINDOW_MS;

    // demo 用户（访客试用）和 48 小时内新注册用户都显示引导
    if (isDemo || isNewUser) {
      setShow(true);
    } else {
      try { window.localStorage.setItem(TOUR_KEY, "1"); } catch {}
    }
  }, [user, isAuthenticated]);

  const complete = () => {
    try { window.localStorage.setItem(TOUR_KEY, "1"); } catch {}
    setShow(false);
  };

  if (!show) return null;
  return <OnboardingModal onComplete={complete} />;
}
