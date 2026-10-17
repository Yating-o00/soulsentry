import { useState, useEffect, useCallback } from "react";
import Taro from "@tarojs/taro";
import { getToken, clearToken, rememberAccount, isDemoMode, setDemoMode } from "@/utils/auth";
import { get } from "@/utils/api";

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getToken();
    // Demo 会话不算真实登录：不拉用户信息、不记入账户切换列表
    if (!token || isDemoMode()) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 3000);

    try {
      const data = await get("/users/me", {}, { silent: true });
      setUser(data);
      rememberAccount({ ...data, token });
    } catch (err) {
      setUser(null);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setDemoMode(false);
    setUser(null);
    Taro.reLaunch({ url: "/pages/index/index" });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    user,
    loading,
    isLoggedIn: Boolean(user),
    logout,
    refresh
  };
}
