import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellRing, CheckCircle2, XCircle, Send, Clock, Zap, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format, isPast, parseISO, differenceInMinutes } from "date-fns";

export default function PushNotificationSetup() {
  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState(
    notificationSupported ? Notification.permission : 'denied'
  );
  const [testSending, setTestSending] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time', 50),
  });

  // Filter upcoming tasks with reminder_time set
  const now = new Date();
  const upcomingTasks = tasks.filter(t => {
    if (!t.reminder_time || t.status === 'completed' || t.status === 'cancelled') return false;
    const rt = parseISO(t.reminder_time);
    return !isPast(rt);
  }).sort((a, b) => new Date(a.reminder_time) - new Date(b.reminder_time)).slice(0, 8);

  const pastDueTasks = tasks.filter(t => {
    if (!t.reminder_time || t.status === 'completed' || t.status === 'cancelled') return false;
    const rt = parseISO(t.reminder_time);
    return isPast(rt) && !t.reminder_sent;
  }).slice(0, 5);

  const requestPermission = async () => {
    if (!notificationSupported) {
      toast.error("您的浏览器不支持推送通知");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      toast.success("推送通知已开启！您将收到任务提醒");
    } else {
      toast.error("通知权限被拒绝，请在浏览器设置中手动开启");
    }
  };

  const sendTestNotification = () => {
    if (permission !== 'granted') {
      toast.error("请先开启通知权限");
      return;
    }
    setTestSending(true);
    
    setTimeout(() => {
      try {
        new Notification("🔔 SoulSentry 测试通知", {
          body: "恭喜！推送通知设置成功。当任务到期时，您将收到类似的实时提醒。",
          icon: "/favicon.ico",
          tag: "test-notification",
          requireInteraction: false,
        });
        toast.success("测试通知已发送，请查看浏览器通知");
      } catch (e) {
        toast.error("通知发送失败: " + e.message);
      }
      setTestSending(false);
    }, 500);
  };

  const getTimeLabel = (reminderTime) => {
    const rt = parseISO(reminderTime);
    const mins = differenceInMinutes(rt, now);
    if (mins < 60) return `${mins} 分钟后`;
    if (mins < 1440) return `${Math.floor(mins / 60)} 小时后`;
    return `${Math.floor(mins / 1440)} 天后`;
  };

  const priorityConfig = {
    urgent: { color: "bg-red-100 text-red-700 border-red-200", label: "紧急" },
    high: { color: "bg-orange-100 text-orange-700 border-orange-200", label: "高" },
    medium: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "中" },
    low: { color: "bg-slate-100 text-slate-600 border-slate-200", label: "低" },
  };

  return (
    <div className="space-y-6">
      {/* Permission Status Hero */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className={`p-6 md:p-8 ${
          permission === 'granted' 
            ? 'bg-gradient-to-br from-emerald-500 to-teal-600' 
            : permission === 'denied'
            ? 'bg-gradient-to-br from-red-500 to-rose-600'
            : 'bg-gradient-to-br from-[#384877] to-[#3b5aa2]'
        } text-white`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                {permission === 'granted' ? (
                  <BellRing className="w-8 h-8" />
                ) : permission === 'denied' ? (
                  <XCircle className="w-8 h-8" />
                ) : (
                  <Bell className="w-8 h-8" />
                )}
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold mb-1">
                  {permission === 'granted' ? '推送通知已开启' : permission === 'denied' ? '推送通知被阻止' : '开启实时推送通知'}
                </h2>
                <p className="text-white/80 text-sm md:text-base">
                  {permission === 'granted' 
                    ? '当任务到期时，您将收到浏览器实时推送提醒，确保不错过任何重要事项'
                    : permission === 'denied'
                    ? '通知权限被浏览器阻止，请点击地址栏左侧的锁图标手动开启'
                    : '授权后，系统将自动在任务到期时发送浏览器推送通知'}
                </p>
              </div>
            </div>
            
            {permission === 'granted' ? (
              <Badge className="bg-white/20 text-white border-white/30 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 已激活
              </Badge>
            ) : null}
          </div>

          <div className="flex gap-3 mt-6">
            {permission !== 'granted' && permission !== 'denied' && (
              <Button onClick={requestPermission} className="bg-white text-[#384877] hover:bg-white/90 font-semibold">
                <Bell className="w-4 h-4 mr-2" />
                立即开启推送
              </Button>
            )}
            {permission === 'denied' && (
              <Button onClick={requestPermission} variant="outline" className="border-white/30 text-white hover:bg-white/10">
                <Shield className="w-4 h-4 mr-2" />
                重新请求权限
              </Button>
            )}
            {permission === 'granted' && (
              <Button 
                onClick={sendTestNotification} 
                disabled={testSending}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/20"
              >
                <Send className="w-4 h-4 mr-2" />
                {testSending ? '发送中...' : '发送测试通知'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* How it works */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            工作原理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: "1", title: "识别待办", desc: "通过AI自然语言解析或手动创建，识别出带有时间的待办事项", icon: "🧠" },
              { step: "2", title: "自动监控", desc: "系统每30秒扫描一次，检测即将到期和已到期的任务提醒", icon: "📡" },
              { step: "3", title: "实时推送", desc: "到达提醒时间时，自动发送浏览器推送通知，支持提前提醒", icon: "🔔" },
            ].map(item => (
              <div key={item.step} className="flex gap-3 p-4 bg-slate-50 rounded-xl">
                <div className="text-2xl shrink-0">{item.icon}</div>
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm mb-1">{item.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming task reminders */}
      {upcomingTasks.length > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#384877]" />
                即将推送的提醒
              </CardTitle>
              <Badge variant="outline" className="text-xs">{upcomingTasks.length} 个待推送</Badge>
            </div>
            <CardDescription>以下任务将在到期时自动发送浏览器推送通知</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingTasks.map((task, idx) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    task.priority === 'urgent' ? 'bg-red-500' :
                    task.priority === 'high' ? 'bg-orange-500' :
                    task.priority === 'medium' ? 'bg-blue-500' : 'bg-slate-400'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                    <p className="text-xs text-slate-500">
                      {format(parseISO(task.reminder_time), 'MM/dd HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${priorityConfig[task.priority]?.color || ''}`}>
                    {priorityConfig[task.priority]?.label || task.priority}
                  </Badge>
                  <span className="text-xs text-[#384877] font-medium whitespace-nowrap">
                    {getTimeLabel(task.reminder_time)}
                  </span>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Missed reminders */}
      {pastDueTasks.length > 0 && (
        <Card className="border-0 shadow-md border-l-4 border-l-amber-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              未推送的逾期提醒
            </CardTitle>
            <CardDescription>以下任务已过期但提醒未发送，可能因通知权限关闭导致</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pastDueTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                    <p className="text-xs text-amber-600">
                      {format(parseISO(task.reminder_time), 'MM/dd HH:mm')} 已过期
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No browser support */}
      {!notificationSupported && (
        <Card className="border-0 shadow-md bg-red-50">
          <CardContent className="p-6 flex items-center gap-4">
            <XCircle className="w-8 h-8 text-red-500 shrink-0" />
            <div>
              <h3 className="font-semibold text-red-800 mb-1">浏览器不支持推送通知</h3>
              <p className="text-sm text-red-600">
                您的浏览器（如旧版 iOS Safari）不支持 Notification API。请使用 Chrome、Edge 或 Firefox 以获取完整的推送通知功能。
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}