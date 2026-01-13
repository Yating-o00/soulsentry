import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import Welcome from "./Welcome";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkFirstVisit();
  }, []);

  const checkFirstVisit = async () => {
    try {
      const user = await base44.auth.me();
      
      // 检查用户是否已经看过欢迎页
      if (user?.has_seen_welcome) {
        // 已看过，直接跳转到Dashboard
        navigate(createPageUrl("Dashboard"), { replace: true });
      } else {
        // 首次访问，显示欢迎页
        setShowWelcome(true);
        setLoading(false);
      }
    } catch (error) {
      console.error("检查用户状态失败:", error);
      // 出错时默认跳转到Dashboard
      navigate(createPageUrl("Dashboard"), { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Loader2 className="w-8 h-8 text-[#384877] animate-spin" />
      </div>
    );
  }

  if (showWelcome) {
    return <Welcome />;
  }

  return null;
}