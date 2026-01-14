import React, { useState, useEffect } from "react";
import Welcome from "@/pages/Welcome";

export default function WelcomeGuard({ children }) {
  const [showWelcome, setShowWelcome] = useState(() => {
    // 检查 sessionStorage 是否已访问过
    return !sessionStorage.getItem("visited");
  });

  useEffect(() => {
    if (!showWelcome) {
      // 标记已访问
      sessionStorage.setItem("visited", "true");
    }
  }, [showWelcome]);

  if (showWelcome) {
    return <Welcome onComplete={() => setShowWelcome(false)} />;
  }

  return children;
}