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
    // 检查是否已访问过（使用 localStorage 而非 sessionStorage）
    const visited = safeLocalStorage.getItem("app_visited");
    if (!visited) {
      setShowWelcome(true);
    }
  }, []);

  const handleComplete = () => {
    // 标记已访问
    safeLocalStorage.setItem("app_visited", "true");
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