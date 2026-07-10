import React, { useState } from "react";
import OnboardingTour from "./OnboardingTour";

const TOUR_KEY = "ss_tour_completed_v2";

export default function OnboardingHost() {
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(TOUR_KEY); } catch { return false; }
  });

  if (!show) return null;

  const complete = () => {
    try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
    setShow(false);
  };

  return <OnboardingTour onComplete={complete} />;
}