import React, { useState, useEffect } from "react";
import OnboardingTour from "./OnboardingTour";
import { base44 } from "@/api/base44Client";

const TOUR_KEY = "ss_tour_completed_v2";
// 账户创建后 48 小时内视为"新用户"，超过则不再弹出引导
const NEW_USER_WINDOW_MS = 48 * 60 * 60 * 1000;

export default function OnboardingHost() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 本地已完成 → 直接跳过，不请求
    try { if (localStorage.getItem(TOUR_KEY)) return; } catch {}

    let cancelled = false;
    base44.auth.me().then((user) => {
      if (cancelled || !user) return;
      // 账号级标记：任何设备上完成过引导都不再显示
      if (user.tour_completed) {
        try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
        return;
      }
      // 仅对首次登录的新用户显示（注册 48 小时内）
      const isNewUser = Date.now() - new Date(user.created_date).getTime() < NEW_USER_WINDOW_MS;
      if (isNewUser) {
        setShow(true);
      } else {
        // 老用户：静默标记为已完成，避免以后重复判断
        base44.auth.updateMe({ tour_completed: true }).catch(() => {});
        try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const complete = () => {
    try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
    base44.auth.updateMe({ tour_completed: true }).catch(() => {});
    setShow(false);
  };

  return <OnboardingTour onComplete={complete} />;
}