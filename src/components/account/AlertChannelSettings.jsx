import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, MessageSquare, Mail, Save, Loader2, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * 预警通道设置 —— 配置企业微信 Webhook、自动预警开关与渠道
 */
export default function AlertChannelSettings({ user }) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [channels, setChannels] = useState(["wework"]);
  const [hoursBefore, setHoursBefore] = useState(2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setWebhookUrl(user.wework_webhook_url || "");
    const s = user.task_alert_settings || {};
    setAutoEnabled(s.auto_alert_enabled || false);
    setChannels(s.alert_channels?.length ? s.alert_channels : ["wework"]);
    setHoursBefore(s.alert_hours_before ?? 2);
  }, [user]);

  const toggleChannel = (ch) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSave = async () => {
    if (webhookUrl && !/qyapi\.weixin\.qq\.com/.test(webhookUrl)) {
      toast.error("请填写有效的企业微信群机器人 Webhook URL");
      return;
    }
    setSaving(true);
    try {
      await base44.auth.updateMe({
        wework_webhook_url: webhookUrl.trim(),
        task_alert_settings: {
          auto_alert_enabled: autoEnabled,
          alert_channels: channels.length ? channels : ["wework"],
          alert_hours_before: Math.max(1, Math.min(48, Number(hoursBefore) || 2)),
        },
      });
      toast.success("预警设置已保存");
    } catch (e) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border border-slate-100 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[#fef3f2] flex items-center justify-center">
            <Bell className="w-4 h-4 text-[#d5495f]" />
          </div>
          任务预警推送
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 企业微信 Webhook */}
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#384877]" />
            企业微信群机器人 Webhook
          </Label>
          <Input
            placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="rounded-lg font-mono text-xs"
          />
          <a
            href="https://developer.work.weixin.qq.com/document/path/91770"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-[#384877]"
          >
            如何获取 Webhook URL <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* 自动预警开关 */}
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
          <div>
            <div className="text-sm font-medium text-slate-900">临近截止自动推送</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              当任务即将到期时自动发送预警
            </div>
          </div>
          <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} />
        </div>

        {autoEnabled && (
          <div className="space-y-4 pl-2 border-l-2 border-[#eef0fa]">
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">推送渠道</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={channels.includes("wework")}
                    onCheckedChange={() => toggleChannel("wework")}
                  />
                  <span className="text-sm flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#384877]" />
                    企业微信
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={channels.includes("email")}
                    onCheckedChange={() => toggleChannel("email")}
                  />
                  <span className="text-sm flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#384877]" />
                    邮件
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">提前多少小时预警</Label>
              <Input
                type="number"
                min={1}
                max={48}
                value={hoursBefore}
                onChange={(e) => setHoursBefore(e.target.value)}
                className="rounded-lg w-24"
              />
            </div>
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#384877] hover:bg-[#2d3a60] text-white rounded-xl h-10"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 保存中
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" /> 保存设置
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}