import React, { useState } from "react";
import { useLocation } from "react-router-dom";
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
  // 暂时关闭 Welcome 页面，后续可通过开启下方逻辑恢复
  return children;
}
