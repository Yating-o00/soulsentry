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
  const [isClient, setIsClient] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    setIsClient(true);
    // 检查是否已访问过
    const visited = safeSessionStorage.getItem("visited");
    if (visited) {
      setShowWelcome(false);
    }
  }, []);

  useEffect(() => {
    if (isClient && !showWelcome) {
      // 标记已访问
      safeSessionStorage.setItem("visited", "true");
    }
  }, [isClient, showWelcome]);

  if (!isClient) {
    return null;
  }

  if (showWelcome) {
    return <Welcome />;
  }

  return children;
}