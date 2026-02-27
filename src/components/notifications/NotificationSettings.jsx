import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Volume2, Clock, Zap, Sparkles, Mail, Smartphone } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LocationReminderSettings from "./LocationReminderSettings";
import EmailReminderSettings from "./EmailReminderSettings";

const SOUND_OPTIONS = [
{ value: "default", label: "默认", emoji: "🔔" },
{ value: "gentle", label: "轻柔", emoji: "🎵" },
{ value: "urgent", label: "紧急", emoji: "⚡" },
{ value: "chime", label: "铃声", emoji: "🎼" },
{ value: "bells", label: "钟声", emoji: "🔊" },
{ value: "none", label: "静音", emoji: "🔇" }];


export default function NotificationSettings({ taskDefaults, onUpdate }) {
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const [settings, setSettings] = useState({
    notification_sound: taskDefaults?.notification_sound || "default",
    persistent_reminder: taskDefaults?.persistent_reminder || false,
    notification_interval: taskDefaults?.notification_interval || 15,
    advance_reminders: taskDefaults?.advance_reminders || [],
    notification_channels: taskDefaults?.notification_channels || ["in_app", "browser"]
  });

  const [testSound, setTestSound] = useState(null);
  const [customAdvanceTime, setCustomAdvanceTime] = useState("");

  const handleSoundTest = (sound) => {
    setTestSound(sound);
    const audio = new Audio(`https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3`);
    audio.play().catch((err) => console.log("Test failed:", err));
    setTimeout(() => setTestSound(null), 1000);
  };

  const toggleAdvanceReminder = (minutes) => {
    const current = settings.advance_reminders || [];
    const updated = current.includes(minutes) ?
    current.filter((m) => m !== minutes) :
    [...current, minutes].sort((a, b) => b - a);

    const newSettings = { ...settings, advance_reminders: updated };
    setSettings(newSettings);
    onUpdate?.(newSettings);
  };

  const toggleNotificationChannel = (channel) => {
    const current = settings.notification_channels || [];
    const updated = current.includes(channel) ?
    current.filter((c) => c !== channel) :
    [...current, channel];

    const newSettings = { ...settings, notification_channels: updated };
    setSettings(newSettings);
    onUpdate?.(newSettings);
  };

  return (
    <Tabs defaultValue="basic" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 bg-slate-100">
        <TabsTrigger value="basic">基础设置</TabsTrigger>
        <TabsTrigger value="location">位置提醒</TabsTrigger>
        <TabsTrigger value="email">邮件提醒</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="w-5 h-5 text-purple-500" />
              通知渠道
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">
              选择接收提醒的方式
            </p>
            <div className="flex flex-wrap gap-3">
              {[
              { value: "in_app", label: "应用内", icon: "📱" },
              { value: "browser", label: "浏览器通知", icon: "🔔" },
              { value: "email", label: "邮件", icon: "✉️" }].
              map((channel) =>
              <motion.button
                key={channel.value}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleNotificationChannel(channel.value)}
                className={`px-5 py-3 text-sm font-semibold rounded-xl border-2 transition-all duration-200 ${
                  settings.notification_channels?.includes(channel.value)
                    ? "bg-gradient-to-r from-purple-500 to-blue-600 border-purple-500 text-white shadow-lg shadow-purple-500/30"
                    : "bg-white text-slate-500 border-slate-200 hover:border-purple-300"
                }`}>












                  <span className="mr-2">{channel.icon}</span>
                  {channel.label}
                </motion.button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="w-5 h-5 text-purple-500" />
            提醒音效
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SOUND_OPTIONS.map((option) =>
              <motion.button
                key={option.value}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const newSettings = { ...settings, notification_sound: option.value };
                  setSettings(newSettings);
                  onUpdate?.(newSettings);
                  handleSoundTest(option.value);
                }}
                className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                settings.notification_sound === option.value ?
                "border-purple-500 bg-purple-50 shadow-lg" :
                "border-slate-200 hover:border-purple-300 bg-white"}`
                }>

                <div className="text-3xl mb-2">{option.emoji}</div>
                <div className="font-medium text-sm">{option.label}</div>
                {testSound === option.value &&
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="mt-2">

                    <Badge className="bg-green-500">播放中</Badge>
                  </motion.div>
                }
              </motion.button>
              )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-blue-500" />
            提前提醒
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-4">
            在任务到期前收到额外提醒
          </p>
          <div className="flex flex-wrap gap-3">
            {[5, 15, 30, 60, 120].map((minutes) =>
              <motion.button
                key={minutes}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleAdvanceReminder(minutes)}
                className={`px-5 py-3 rounded-xl border-2 font-semibold text-sm transition-all duration-200 ${
                settings.advance_reminders?.includes(minutes) ?
                "bg-gradient-to-r from-blue-500 to-purple-600 text-white border-blue-500 shadow-lg shadow-blue-500/30 scale-105" :
                "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-slate-50"}`
                }>

                {minutes < 60 ? `${minutes}分钟` : `${minutes / 60}小时`}前
              </motion.button>
              )}
            {/* Show custom times if any */}
            {settings.advance_reminders?.filter((m) => ![5, 15, 30, 60, 120].includes(m)).map((minutes) =>
              <motion.button
                key={minutes}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleAdvanceReminder(minutes)}
                className="px-5 py-3 rounded-xl border-2 font-semibold text-sm bg-gradient-to-r from-blue-500 to-purple-600 text-white border-blue-500 shadow-lg shadow-blue-500/30 scale-105">

                {minutes < 60 ? `${minutes}分钟` : `${(minutes / 60).toFixed(1)}小时`}前
              </motion.button>
              )}
          </div>
          
          <div className="flex items-center gap-2 mt-4">
             <Label className="text-sm shrink-0">自定义(分钟):</Label>
             <input
                type="number"
                className="w-20 h-8 border rounded-md px-2 text-sm"
                placeholder="分钟"
                value={customAdvanceTime}
                onChange={(e) => setCustomAdvanceTime(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customAdvanceTime) {
                    const mins = parseInt(customAdvanceTime);
                    if (mins > 0) {
                      toggleAdvanceReminder(mins);
                      setCustomAdvanceTime("");
                    }
                  }
                }} />

             <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const mins = parseInt(customAdvanceTime);
                  if (mins > 0) {
                    toggleAdvanceReminder(mins);
                    setCustomAdvanceTime("");
                  }
                }}>
                添加</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="w-5 h-5 text-orange-500" />
            持续提醒
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label htmlFor="persistent" className="text-base font-medium">
                任务过期后持续提醒
              </Label>
              <p className="text-sm text-slate-600 mt-1">
                直到完成任务才停止提醒
              </p>
            </div>
            <Switch
                id="persistent"
                checked={settings.persistent_reminder}
                onCheckedChange={(checked) => {
                  const newSettings = { ...settings, persistent_reminder: checked };
                  setSettings(newSettings);
                  onUpdate?.(newSettings);
                }} />

          </div>

          {settings.persistent_reminder &&
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="pt-4 border-t">

              <Label className="text-sm font-medium mb-2 block">
                提醒间隔
              </Label>
              <Select
                value={String(settings.notification_interval)}
                onValueChange={(value) => {
                  const newSettings = { ...settings, notification_interval: parseInt(value) };
                  setSettings(newSettings);
                  onUpdate?.(newSettings);
                }}>

                <SelectTrigger className="border-0 bg-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">每5分钟</SelectItem>
                  <SelectItem value="10">每10分钟</SelectItem>
                  <SelectItem value="15">每15分钟</SelectItem>
                  <SelectItem value="30">每30分钟</SelectItem>
                  <SelectItem value="60">每小时</SelectItem>
                </SelectContent>
              </Select>
            </motion.div>
            }
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 mb-1">AI智能提醒</h4>
              <p className="text-sm text-slate-600 mb-3">
                系统正在学习您的工作习惯，并会在最合适的时间发送提醒
              </p>
              <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                <Zap className="w-3 h-3 mr-1" />
                自动优化中
              </Badge>
            </div>
          </div>
        </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="location">
        <LocationReminderSettings
          taskDefaults={taskDefaults}
          onUpdate={onUpdate} />

      </TabsContent>

      <TabsContent value="email">
        <EmailReminderSettings
          taskDefaults={taskDefaults}
          onUpdate={onUpdate}
          userEmail={currentUser?.email} />

      </TabsContent>
    </Tabs>);

}