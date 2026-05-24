import React from "react";
import { Button } from "@/components/ui/button";
import { BellRing, X, Loader2 } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const DISMISS_KEY = "ss_push_banner_dismissed_at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天内不再提示

/**
 * Dashboard 顶部一键开启后台推送横幅
 * - 仅在浏览器支持、未订阅、未被用户暂时关闭时显示
 * - 一个按钮完成全部操作（请求权限 + 订阅 + 保存到后端）
 */
export default function EnableBackgroundPushBanner() {
  const { supported, permission, subscribed, busy, subscribe } = usePushSubscription();
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      const ts = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      return ts && Date.now() - ts < DISMISS_TTL_MS;
    } catch {
      return false;
    }
  });

  if (!supported || subscribed || dismissed) return null;

  const handleEnable = async () => {
    if (permission === "denied") {
      toast.error("通知权限已被拒绝。请点击地址栏锁形图标 → 通知 → 允许，然后刷新页面");
      return;
    }
    const ok = await subscribe();
    if (ok) {
      toast.success("已开启！关闭应用也能收到提醒");
    } else {
      toast.error("开启失败，请检查通知权限");
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-500 p-[1px] shadow-lg"
      >
        <div className="rounded-2xl bg-gradient-to-r from-rose-50 via-pink-50 to-orange-50 px-4 py-3 md:px-5 md:py-4 flex items-center gap-3">
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-md">
            <BellRing className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm md:text-base">
              开启后台推送，关闭应用也能收到提醒
            </p>
            <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
              任务、地理围栏和 AI 哨兵会通过系统通知直接弹到您面前
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleEnable}
            disabled={busy}
            className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-md flex-shrink-0 h-9 md:h-10 px-3 md:px-4"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <BellRing className="w-4 h-4 mr-1" />
            )}
            <span className="text-xs md:text-sm">一键开启</span>
          </Button>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 w-7 h-7 rounded-full hover:bg-white/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
            title="暂不开启"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}