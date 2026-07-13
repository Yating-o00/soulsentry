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

  const handleToggle = async (checked) => {
    try {
      if (pref) {
        await base44.entities.UserPreference.update(pref.id, { watch_mode: checked });
      } else {
        await base44.entities.UserPreference.create({ watch_mode: checked });
      }
      queryClient.invalidateQueries({ queryKey: ["user-preference-watch"] });
      toast.success(checked ? "手表模式已开启 ⌚" : "手表模式已关闭");
    } catch (e) {
      toast.error("保存失败，请重试");
    }
  };

  const sendTestPush = async () => {
    setTesting(true);
    try {
      await base44.functions.invoke("sendWebPush", {
        title: "⌚ 手表通知测试",
        body: "如果手表震动并显示此消息，说明实时通知已就绪",
        tag: "watch-test",
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
      });
      toast.success("测试通知已发送，请查看手表");
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

        {!pushEnabled && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ 尚未开启后台推送。请先在上方「后台推送」中订阅，手表才能收到通知。
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={sendTestPush}
          disabled={testing || !pushEnabled}
          className="border-emerald-200 hover:bg-emerald-50 text-emerald-700"
        >
          {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BellRing className="w-4 h-4 mr-2" />}
          发送测试通知到手表
        </Button>

        <div className="text-xs text-slate-400 space-y-1 pt-1">
          <p>· Apple Watch：iPhone 锁屏或熄屏时，通知自动转发到手表</p>
          <p>· Wear OS：手机通知默认镜像到手表，可在手表设置中管理</p>
        </div>
      </CardContent>
    </Card>
  );
}