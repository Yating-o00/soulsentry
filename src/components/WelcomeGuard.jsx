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
    // 使用 localStorage 替代 sessionStorage，确保持久化，并且使用新 key 来重置用户的状态
    try {
      // 检查版本化的 welcome key，这样我们可以强制重置
      var welcomeCompleted = localStorage.getItem("soul_sentry_welcome_completed_v1");
      
      // 只有明确标记为完成时才不显示
      if (!welcomeCompleted) {
        setShowWelcome(true);
      }
    } catch (e) {
      setShowWelcome(true);
    }
  }, []);

  const handleComplete = () => {
    // 标记为永久完成
    try {
      localStorage.setItem("soul_sentry_welcome_completed_v1", "true");
    } catch (e) {
      // 忽略存储错误
    }
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