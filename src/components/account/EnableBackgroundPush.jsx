import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BellRing, CheckCircle2, AlertCircle, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { toast } from "sonner";

// 判断当前页面是否运行在 iframe 中（base44 编辑器预览就是 iframe）
const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * 后台推送一键开启卡片
 * - 让用户在 App 关闭/最小化时仍能收到通知
 * - 必须用户主动点击触发权限请求（浏览器策略限制）
 */
export default function EnableBackgroundPush() {
  const { supported, permission, subscribed, busy, subscribe, unsubscribe } =
    usePushSubscription();

  const handleEnable = async () => {
    if (permission === "denied") {
      toast.error("您之前拒绝了通知权限，请到浏览器站点设置中手动开启");
      return;
    }
    const ok = await subscribe();
    if (ok) {
      toast.success("后台推送已开启，关闭应用也能收到提醒");
    } else {
      toast.error("开启失败，请检查浏览器通知权限");
    }
  };

  const handleDisable = async () => {
    await unsubscribe();
    toast.success("已关闭后台推送");
  };

  if (!supported) {
    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardContent className="p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-slate-500" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-800 mb-1">当前浏览器不支持后台推送</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              iOS 用户请先用 Safari 把网页"添加到主屏幕"后再开启，安卓 / 桌面端建议使用 Chrome 或 Edge。
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isOn = subscribed && permission === "granted";

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isOn ? "bg-emerald-100" : "bg-rose-50"
            }`}
          >
            <BellRing className={`w-5 h-5 ${isOn ? "text-emerald-600" : "text-rose-500"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="font-semibold text-slate-800">关闭应用也能收到提醒</h4>
              {isOn ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  已开启
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200">
                  未开启
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              开启后，即使您退出 SoulSentry 应用，任务提醒、地理围栏、AI 哨兵也会通过浏览器/系统通知弹窗送达。
            </p>

            {isOn ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisable}
                disabled={busy}
                className="h-8 text-xs"
              >
                {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                关闭后台推送
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={busy || permission === "denied"}
                className="h-9 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <BellRing className="w-4 h-4 mr-1.5" />
                )}
                {permission === "denied" ? "通知权限被拒绝" : "一键开启后台推送"}
              </Button>
            )}

            {permission === "denied" && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-rose-500 leading-relaxed">
                  {isInIframe()
                    ? "检测到当前在编辑器预览中，浏览器对 iframe 内的通知权限有额外限制。请在新窗口打开应用后再开启。"
                    : '您之前拒绝了通知权限。请点击地址栏左侧的锁形图标 → 通知 → 改为"允许"，然后刷新页面再试。'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="h-7 text-[11px]"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    刷新重新检测
                  </Button>
                  {isInIframe() && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(window.location.href, "_blank")}
                      className="h-7 text-[11px]"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      在新窗口打开
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}