import React, { useState, useEffect } from "react";
import Welcome from "@/pages/Welcome";

// 安全访问 localStorage（iOS Safari 隐私模式兼容）
const safeLocalStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // 忽略错误
    }
  }
};

export default function WelcomeGuard({ children }) {
  const [isClient, setIsClient] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // 每次刷新都显示先导页（使用 sessionStorage 检查本次会话是否已访问）
    const visitedThisSession = sessionStorage.getItem("session_visited");
    if (!visitedThisSession) {
      setShowWelcome(true);
    }
  }, []);

  const handleComplete = () => {
    // 标记本次会话已访问（刷新后会重置）
    sessionStorage.setItem("session_visited", "true");
    setShowWelcome(false);
  };

  if (!isClient) {
    return null;
  }

  if (showWelcome) {
    return <Welcome onComplete={handleComplete} />;
  }

  return children;
}