import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, MapPin, Moon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { requestPeriodicGeoSync, requestOneTimeGeoSync } from "@/lib/pwaRegister";
import { usePushSubscription } from "@/hooks/usePushSubscription";

/**
 * 冷启动显式偏好引导：在用户首次打开时收集"允许通知/后台定位/免打扰"等关键开关。
 * 这些偏好会写入 localStorage（冷启动秒读） + UserPreference 实体（跨设备同步）。
 */
export default function PreferenceOnboarding({ open, onOpenChange, prefs, onUpdate }) {
  const [enableLocation, setEnableLocation] = useState(prefs?.location_tracking_enabled ?? true);
  const [enableQuiet, setEnableQuiet] = useState(prefs?.quiet_hours_enabled ?? true);
  const [style, setStyle] = useState(prefs?.preferred_reminder_style || 'standard');
  const [saving, setSaving] = useState(false);
  const { subscribe, supported: pushSupported } = usePushSubscription();

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1) 订阅 Push（SW 推送）
      let pushOk = false;
      if (pushSupported) {
        pushOk = await subscribe();
      }

      // 2) 申请定位权限 + 注册后台同步
      if (enableLocation && 'geolocation' in navigator) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(() => resolve(true), () => resolve(false), { timeout: 10000 });
        });
        await requestOneTimeGeoSync();
        await requestPeriodicGeoSync();
      }

      // 3) 写偏好
      await onUpdate({
        onboarded: true,
        location_tracking_enabled: enableLocation,
        quiet_hours_enabled: enableQuiet,
        preferred_reminder_style: style,
        push_enabled: pushOk
      });

      toast.success('偏好已保存');
      onOpenChange(false);
    } catch (e) {
      toast.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            个性化你的提醒
          </DialogTitle>
          <DialogDescription>
            三项关键偏好。我们会记住它们——即使关闭页面也能继续守护你。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <Label className="font-medium">地理情境感知</Label>
                <p className="text-xs text-slate-500 mt-1">
                  允许在后台有限持续定位，到达公司/家/商场时推送相关待办。
                </p>
              </div>
            </div>
            <Switch checked={enableLocation} onCheckedChange={setEnableLocation} />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Moon className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <Label className="font-medium">夜间免打扰</Label>
                <p className="text-xs text-slate-500 mt-1">
                  22:00-08:00 静音重要性低于紧急的提醒。
                </p>
              </div>
            </div>
            <Switch checked={enableQuiet} onCheckedChange={setEnableQuiet} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-5 h-5 text-amber-600" />
              <Label className="font-medium">提醒风格</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'gentle', l: '温柔' },
                { v: 'standard', l: '标准' },
                { v: 'assertive', l: '紧迫' }
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setStyle(o.v)}
                  className={`py-2 rounded-lg text-sm font-medium border transition ${
                    style === o.v
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            稍后再说
          </Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '开启守护'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}