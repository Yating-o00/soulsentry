import React, { useState, useEffect } from "react";
import Welcome from "@/pages/Welcome";

// 安全访问 sessionStorage（iOS Safari 隐私模式兼容）
const safeSessionStorage = {
  getItem: (key) => {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      // 忽略错误
    }
  }
};

export default function WelcomeGuard({ children }) {
  const [showWelcome, setShowWelcome] = useState(() => {
    // 检查 sessionStorage 是否已访问过
    return !safeSessionStorage.getItem("visited");
  });

  useEffect(() => {
    if (!showWelcome) {
      // 标记已访问
      safeSessionStorage.setItem("visited", "true");
    }
  }, [showWelcome]);

  if (showWelcome) {
    return <Welcome onComplete={() => setShowWelcome(false)} />;
  }

  return children;
}