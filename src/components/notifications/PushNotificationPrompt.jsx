import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useAuth } from "@/lib/AuthContext";

export default function PushNotificationPrompt() {
  const { isAuthenticated } = useAuth();
  const { supported, permission, subscribed, busy, subscribe } = usePushSubscription({});
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem("push-prompt-dismissed") === "true");
  }, []);

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      localStorage.setItem("push-prompt-dismissed", "true");
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("push-prompt-dismissed", "true");
  };

  // 只在满足以下条件时显示：浏览器支持、用户已登录、未授权、未订阅、用户未主动关闭
  const shouldShow =
    supported &&
    isAuthenticated &&
    permission !== "granted" &&
    !subscribed &&
    !dismissed;

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[60]"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#384877]" />
                  开启约定提醒
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  允许浏览器通知后，我们将在约定时间到达时主动提醒您。
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleEnable}
                    disabled={busy}
                    size="sm"
                    className="bg-gradient-to-r from-[#384877] to-[#3b5aa2]"
                  >
                    {busy ? "开启中..." : "开启通知"}
                  </Button>
                  <Button
                    onClick={handleDismiss}
                    size="sm"
                    variant="ghost"
                  >
                    暂不
                  </Button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
