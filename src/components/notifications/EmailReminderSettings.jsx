import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Mail, Clock, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export default function EmailReminderSettings({ taskDefaults, onUpdate, userEmail }) {
  const [emailEnabled, setEmailEnabled] = useState(taskDefaults?.email_reminder?.enabled || false);
  const [settings, setSettings] = useState({
    recipient_email: taskDefaults?.email_reminder?.recipient_email || userEmail || "",
    advance_hours: taskDefaults?.email_reminder?.advance_hours || []
  });

  const [customHours, setCustomHours] = useState("");

  const handleToggle = (enabled) => {
    setEmailEnabled(enabled);
    onUpdate?.({
      email_reminder: {
        enabled,
        ...settings
      }
    });
  };

  const handleUpdate = (newSettings) => {
    setSettings(newSettings);
    onUpdate?.({
      email_reminder: {
        enabled: emailEnabled,
        ...newSettings
      }
    });
  };

  const toggleAdvanceHour = (hours) => {
    const current = settings.advance_hours || [];
    const updated = current.includes(hours)
      ? current.filter(h => h !== hours)
      : [...current, hours].sort((a, b) => b - a);
    
    handleUpdate({ ...settings, advance_hours: updated });
  };

  const addCustomHours = () => {
    const hours = parseInt(customHours);
    if (hours > 0 && !settings.advance_hours.includes(hours)) {
      toggleAdvanceHour(hours);
      setCustomHours("");
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="w-5 h-5 text-blue-500" />
          邮件提醒
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label htmlFor="email-enabled" className="text-base font-medium">
              启用邮件提醒
            </Label>
            <p className="text-sm text-slate-600 mt-1">
              在指定时间通过邮件接收任务提醒
            </p>
          </div>
          <Switch
            id="email-enabled"
            checked={emailEnabled}
            onCheckedChange={handleToggle}
          />
        </div>

        <AnimatePresence>
          {emailEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-4 border-t"
            >
              <div>
                <Label className="text-sm font-medium mb-2 block">接收邮箱</Label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={settings.recipient_email}
                  onChange={(e) => handleUpdate({ ...settings, recipient_email: e.target.value })}
                  className="bg-slate-50 border-slate-200"
                />
                <p className="text-xs text-slate-500 mt-1">
                  留空则使用账户邮箱
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">提前发送邮件</Label>
                <p className="text-xs text-slate-600 mb-3">
                  在任务到期前多久发送邮件提醒
                </p>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  {[1, 2, 6, 12, 24, 48].map((hours) => (
                    <motion.button
                      key={hours}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleAdvanceHour(hours)}
                      className={`px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all ${
                        settings.advance_hours?.includes(hours)
                          ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-blue-500 shadow-md"
                          : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {hours < 24 ? `${hours}小时` : `${hours / 24}天`}前
                    </motion.button>
                  ))}
                </div>

                {/* 显示自定义时间 */}
                {settings.advance_hours?.filter(h => ![1, 2, 6, 12, 24, 48].includes(h)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {settings.advance_hours
                      .filter(h => ![1, 2, 6, 12, 24, 48].includes(h))
                      .map((hours) => (
                        <Badge
                          key={hours}
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white cursor-pointer hover:opacity-80"
                          onClick={() => toggleAdvanceHour(hours)}
                        >
                          {hours < 24 ? `${hours}小时` : `${(hours / 24).toFixed(1)}天`}前
                          <X className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="自定义小时数"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addCustomHours();
                      }
                    }}
                    className="flex-1 bg-slate-50 border-slate-200"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addCustomHours}
                    disabled={!customHours || parseInt(customHours) <= 0}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    添加
                  </Button>
                </div>
              </div>

              {settings.advance_hours && settings.advance_hours.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-blue-700 text-sm mb-2">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">已设置 {settings.advance_hours.length} 个邮件提醒</span>
                  </div>
                  <p className="text-xs text-blue-600">
                    系统将在约定到期前{" "}
                    {settings.advance_hours.sort((a, b) => b - a).map((h, i) => (
                      <span key={h}>
                        {i > 0 && (i === settings.advance_hours.length - 1 ? " 和 " : "、")}
                        <strong>{h < 24 ? `${h}小时` : `${h / 24}天`}</strong>
                      </span>
                    ))}{" "}
                    发送邮件提醒到 <strong>{settings.recipient_email || userEmail}</strong>
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}