import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Watch, Loader2, BellRing } from "lucide-react";
import { toast } from "sonner";

/**
 * 手表实时通知设置：
 * 开启后所有推送采用「精简文案 + 强震动 + 高优先级即时送达」，
 * 手机收到的系统通知会自动镜像到已配对的手表（Apple Watch / Wear OS 等）。
 */
export default function WatchNotificationSettings() {
  const [testing, setTesting] = useState(false);
  const queryClient = useQueryClient();

  const { data: pref } = useQuery({
    queryKey: ["user-preference-watch"],
    queryFn: async () => {
      const prefs = await base44.entities.UserPreference.list("-updated_date", 1);
      return prefs?.[0] || null;
    },
  });

  const watchMode = !!pref?.watch_mode;
  const pushEnabled = !!pref?.push_enabled;
  const emailFallback = !!pref?.watch_email_fallback;

  const savePref = async (patch, successMsg) => {
    try {
      if (pref) {
        await base44.entities.UserPreference.update(pref.id, patch);
      } else {
        await base44.entities.UserPreference.create(patch);
      }
      queryClient.invalidateQueries({ queryKey: ["user-preference-watch"] });
      toast.success(successMsg);
    } catch (e) {
      toast.error("保存失败，请重试");
    }
  };

  const handleToggle = (checked) =>
    savePref({ watch_mode: checked }, checked ? "手表模式已开启 ⌚" : "手表模式已关闭");

  const handleEmailFallbackToggle = (checked) =>
    savePref(
      { watch_email_fallback: checked },
      checked ? "邮件备援已开启 📧 提醒将同步发送到您的邮箱" : "邮件备援已关闭"
    );

  const sendTestPush = async (delaySeconds = 0) => {
    setTesting(true);
    if (delaySeconds > 0) {
      toast.info(`将在 ${delaySeconds} 秒后送达，请立即锁屏/息屏 iPhone ⏳`, { duration: delaySeconds * 1000 });
    }
    try {
      await base44.functions.invoke("sendWebPush", {
        title: "⌚ 手表通知测试",
        body: "如果手表震动并显示此消息，说明实时通知已就绪",
        tag: `watch-test-${Date.now()}`,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        delaySeconds,
      });
      if (delaySeconds === 0) toast.success("测试通知已发送，请查看手表");
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      if (/no active push subscription/i.test(msg)) {
        toast.error("请先在上方开启「后台推送」");
      } else {
        toast.error(`发送失败：${msg}`);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50">
        <CardTitle className="flex items-center gap-2">
          <Watch className="w-5 h-5 text-emerald-600" />
          手表实时通知
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-slate-800">手表模式</p>
            <p className="text-sm text-slate-500 mt-0.5">
              推送将采用精简文案、强震动和最高送达优先级，手机通知会自动镜像到配对的手表
            </p>
          </div>
          <Switch checked={watchMode} onCheckedChange={handleToggle} />
        </div>

        <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div>
            <p className="font-medium text-slate-800">邮件备援 <span className="text-xs font-normal text-emerald-600">推荐</span></p>
            <p className="text-sm text-slate-500 mt-0.5">
              每条提醒同时发送邮件。邮件通知在手表上是系统级支持、必定同步震动——当网页推送无法镜像到手表时的可靠补救
            </p>
          </div>
          <Switch checked={emailFallback} onCheckedChange={handleEmailFallbackToggle} />
        </div>

        {!pushEnabled && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ 尚未开启后台推送。请先在上方「后台推送」中订阅，手表才能收到通知。
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendTestPush(0)}
            disabled={testing || !pushEnabled}
            className="border-emerald-200 hover:bg-emerald-50 text-emerald-700"
          >
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BellRing className="w-4 h-4 mr-2" />}
            立即测试
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendTestPush(10)}
            disabled={testing || !pushEnabled}
            className="border-emerald-200 hover:bg-emerald-50 text-emerald-700"
          >
            <Watch className="w-4 h-4 mr-2" />
            锁屏测试（10 秒后送达）
          </Button>
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="font-medium text-slate-700">⌚ 手表收不到通知？请检查：</p>
          <p>1. <b>iPhone 必须锁屏/息屏</b>——手机亮屏解锁时，系统只在手机上显示通知，不会转发到 Apple Watch。请点「锁屏测试」并立即锁屏验证</p>
          <p>2. 本应用需<b>添加到 iPhone 主屏幕</b>（从主屏幕图标打开），Safari 内打开的网页推送不会镜像到手表</p>
          <p>3. iPhone「Watch」App → 通知 → 确认「镜像 iPhone 提醒」中包含本应用</p>
          <p>4. 手表需佩戴在手腕上且已解锁，未开启剧院模式/勿扰</p>
          <p>5. Wear OS：手表「设置 → 通知」中确认未屏蔽手机通知镜像</p>
        </div>
      </CardContent>
    </Card>
  );
}