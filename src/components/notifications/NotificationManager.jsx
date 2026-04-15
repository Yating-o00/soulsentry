import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInMinutes, isPast, parseISO, isSameDay, isWithinInterval, startOfDay, endOfDay, set, getHours, getMinutes, format, isBefore } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Bell, Clock, X } from "lucide-react";

const NOTIFICATION_SOUNDS = {
  default: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  gentle: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3",
  urgent: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  chime: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
  bells: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  none: null
};

export default function NotificationManager() {
  // 检查浏览器是否支持 Notification API（iOS Safari 旧版本不支持）
  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window;
  
  const [permission, setPermission] = useState(function() {
    if (notificationSupported) {
      try {
        return Notification.permission;
      } catch (e) {
        return 'denied';
      }
    }
    return 'denied';
  });
  const checkedTasks = useRef(new Set());
  const audioRef = useRef(null);
  const queryClient = useQueryClient();
  const persistentIntervals = useRef({});

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
    staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
  });

  // 获取最近的用户行为，用于动态调整提醒
  const { data: recentBehaviors = [] } = useQuery({
    queryKey: ['recentBehaviors'],
    queryFn: () => base44.entities.UserBehavior.list('-created_date', 20),
    staleTime: 10 * 60 * 1000, // 10分钟内不重新请求
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['notificationRules'],
    queryFn: () => base44.entities.NotificationRule.list(),
    initialData: [],
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const logBehaviorMutation = useMutation({
    mutationFn: (data) => base44.entities.UserBehavior.create(data),
  });

  useEffect(function() {
    if (notificationSupported && permission === "default") {
      try {
        Notification.requestPermission().then(setPermission);
      } catch (e) {
        console.log("Notification request failed:", e);
      }
    }
  }, [permission, notificationSupported]);

  const playSound = (soundType) => {
    const soundUrl = NOTIFICATION_SOUNDS[soundType];
    if (!soundUrl || soundType === "none") return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    audioRef.current = new Audio(soundUrl);
    audioRef.current.play().catch(err => console.log("Sound play failed:", err));
  };

  var sendNotification = function(task, isAdvanceReminder) {
    if (typeof isAdvanceReminder === 'undefined') isAdvanceReminder = false;
    if (!notificationSupported || permission !== "granted") return;

    // Check DND
    if (currentUser?.dnd_settings?.enabled) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      const startTimeStr = currentUser.dnd_settings.start_time && typeof currentUser.dnd_settings.start_time === 'string' ? currentUser.dnd_settings.start_time : "22:00";
      const endTimeStr = currentUser.dnd_settings.end_time && typeof currentUser.dnd_settings.end_time === 'string' ? currentUser.dnd_settings.end_time : "08:00";
      const startParts = (startTimeStr && typeof startTimeStr === 'string' && startTimeStr.includes(':')) ? startTimeStr.split(':') : ['22', '00'];
      const endParts = (endTimeStr && typeof endTimeStr === 'string' && endTimeStr.includes(':')) ? endTimeStr.split(':') : ['08', '00'];
      const [startH, startM] = (startParts && startParts.length >= 2) ? startParts.map(Number) : [22, 0];
      const [endH, endM] = (endParts && endParts.length >= 2) ? endParts.map(Number) : [8, 0];
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let isDND = false;
      if (startMinutes < endMinutes) {
        // Same day range (e.g. 09:00 to 17:00)
        isDND = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // Overnight range (e.g. 22:00 to 08:00)
        isDND = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }

      if (isDND) {
        console.log("Notification muted by DND mode");
        return;
      }
    }

    // Check for matching rules
    const matchingRule = rules.find(rule => 
      rule.is_enabled && 
      (rule.condition_category === "all" || rule.condition_category === task.category) &&
      (rule.condition_priority === "all" || rule.condition_priority === task.priority)
    );

    if (matchingRule && matchingRule.action_mute) {
      console.log(`Notification muted by rule: ${matchingRule.title}`);
      // Log the behavior even if muted, or skip? Maybe skip log for now or log as 'muted'
      return; 
    }

    const soundToPlay = matchingRule ? matchingRule.action_sound : (task.notification_sound || "default");

    // 处理高级提醒策略的消息
    let title = isAdvanceReminder 
      ? `📋 即将到来：${task.title}`
      : `⏰ 提醒：${task.title}`;
    let body = task.description || "现在是完成这个约定的时间";
    let messageType = "default";

    // 检查是否有自定义策略消息
    if (isAdvanceReminder && task.reminder_strategy?.steps) {
        // 查找匹配的step
        // 注意：这里的匹配逻辑比较简单，实际上可能需要传递具体触发的minutes
        // 为了简化，我们假设isAdvanceReminder如果是对象，包含了具体的step信息
        // 或者我们通过遍历找到最接近的
    }

    // 如果传入了具体的消息配置 (用于复杂策略)
    if (typeof isAdvanceReminder === 'object' && isAdvanceReminder.custom_message) {
        title = isAdvanceReminder.title || title;
        body = isAdvanceReminder.custom_message;
        messageType = isAdvanceReminder.message_type;
        
        if (messageType === 'urgent') title = `🚨 紧急提醒：${task.title}`;
        if (messageType === 'encouraging') title = `✨ 加油：${task.title}`;
        if (messageType === 'summary') title = `📊 状态摘要：${task.title}`;
    }

    var notification;
    try {
      notification = new Notification(title, {
        body: body,
        icon: "/favicon.ico",
        tag: task.id,
        requireInteraction: task.persistent_reminder,
        silent: soundToPlay === "none",
      });

      playSound(soundToPlay);

      notification.onclick = function() {
        window.focus();
        notification.close();
        
        logBehaviorMutation.mutate({
          event_type: "notification_interacted",
          task_id: task.id,
          hour_of_day: new Date().getHours(),
          day_of_week: new Date().getDay(),
          category: task.category,
          response_time_seconds: 0,
        });
      };
    } catch (e) {
      console.log("Notification creation failed:", e);
    }

    // 显示toast通知
    toast.custom((t) => (
      <div className="bg-white rounded-xl shadow-2xl border-2 border-purple-200 p-4 min-w-[300px]">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-slate-800 mb-1">{task.title}</h4>
            <p className="text-sm text-slate-600 mb-3">{body}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  handleSnooze(task, 15);
                  toast.dismiss(t);
                }}
                variant="outline"
                className="text-xs"
              >
                <Clock className="w-3 h-3 mr-1" />
                稍后15分钟
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  handleComplete(task);
                  toast.dismiss(t);
                }}
                className="text-xs bg-gradient-to-r from-green-500 to-emerald-600"
              >
                标记完成
              </Button>
            </div>
          </div>
          <button
            onClick={() => toast.dismiss(t)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    ), {
      duration: task.persistent_reminder ? Infinity : 10000,
    });

    // 仅针对非重复/非每日提醒的约定更新数据库状态
    // 如果是 isAdvanceReminder（提前提醒）或者是每日循环提醒（通过参数判断），则不更新 reminder_sent
    if (!isAdvanceReminder && !task.is_daily_recurring_instance) {
      updateTaskMutation.mutate({
        id: task.id,
        data: { reminder_sent: true }
      });
    }
  };

  const handleSnooze = (task, minutes) => {
    const snoozeUntil = new Date();
    snoozeUntil.setMinutes(snoozeUntil.getMinutes() + minutes);

    updateTaskMutation.mutate({
      id: task.id,
      data: {
        status: "snoozed",
        snooze_until: snoozeUntil.toISOString(),
        snooze_count: (task.snooze_count || 0) + 1,
      }
    });

    logBehaviorMutation.mutate({
      event_type: "task_snoozed",
      task_id: task.id,
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
      category: task.category,
      metadata: { snooze_minutes: minutes }
    });

    checkedTasks.current.delete(task.id);
  };

  const handleComplete = (task) => {
    updateTaskMutation.mutate({
      id: task.id,
      data: {
        status: "completed",
        completed_at: new Date().toISOString()
      }
    });

    logBehaviorMutation.mutate({
      event_type: "task_completed",
      task_id: task.id,
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
      category: task.category,
    });

    if (persistentIntervals.current[task.id]) {
      clearInterval(persistentIntervals.current[task.id]);
      delete persistentIntervals.current[task.id];
    }
  };

  const setupPersistentReminder = (task) => {
    if (persistentIntervals.current[task.id]) return;

    const interval = task.notification_interval || 15;
    persistentIntervals.current[task.id] = setInterval(() => {
      if (task.status === "completed" || task.status === "cancelled") {
        clearInterval(persistentIntervals.current[task.id]);
        delete persistentIntervals.current[task.id];
        return;
      }
      sendNotification(task, false);
    }, interval * 60 * 1000);
  };

  useEffect(() => {
    const now = new Date();

    tasks.forEach(task => {
      if (task.status === "completed" || task.status === "cancelled") {
        if (persistentIntervals.current[task.id]) {
          clearInterval(persistentIntervals.current[task.id]);
          delete persistentIntervals.current[task.id];
        }
        return;
      }

      // Skip tasks without reminder_time
      if (!task.reminder_time) {
        return;
      }

      const start = parseISO(task.reminder_time);
      // Determine if task is multi-day (has end_time on a different day)
      const end = task.end_time ? parseISO(task.end_time) : start;
      const isMultiDay = !isSameDay(start, end);
      
      // Initialize reminderTime. For multi-day, we might update this to today's instance.
      let reminderTime = task.snooze_until ? parseISO(task.snooze_until) : start;

      if (task.snooze_until) {
          // Snoozed logic (override normal schedule)
          if (isPast(reminderTime) && !checkedTasks.current.has(task.id)) {
             sendNotification(task, false);
             checkedTasks.current.add(task.id);
          }
      } else if (isMultiDay) {
          // Multi-day logic: Remind daily at the specific time
          // Check if today is within the range [start date, end date]
          const rangeStart = startOfDay(start);
          const rangeEnd = endOfDay(end);

          if (isWithinInterval(now, { start: rangeStart, end: rangeEnd })) {
             // Construct target time for today using start time's clock
             const targetTime = set(now, { 
                 hours: getHours(start), 
                 minutes: getMinutes(start), 
                 seconds: 0, 
                 milliseconds: 0 
             });
             
             // Update reminderTime for downstream logic (advance reminders etc)
             reminderTime = targetTime;

             // Check conditions:
             // 1. Past the target time for today
             // 2. Not past the global end time (if specific end time exists)
             // 3. Not before the global start time
             if (isPast(targetTime) && (!task.end_time || isBefore(now, end)) && !isBefore(now, start)) {
                 const uniqueKey = `${task.id}-daily-${format(now, 'yyyy-MM-dd')}`;
                 const hasNotifiedToday = typeof window !== 'undefined' && localStorage.getItem(`notified-${uniqueKey}`);

                 if (!hasNotifiedToday && !checkedTasks.current.has(uniqueKey)) {
                     // Tag task object temporarily to prevent DB update in sendNotification
                     const taskWithFlag = { ...task, is_daily_recurring_instance: true };
                     sendNotification(taskWithFlag, false);
                     
                     checkedTasks.current.add(uniqueKey);
                     if (typeof window !== 'undefined') {
                         localStorage.setItem(`notified-${uniqueKey}`, 'true');
                     }
                 }
             }
          }
      } else {
          // Single day logic (Original)
          if (isPast(reminderTime) && !task.reminder_sent && !checkedTasks.current.has(task.id)) {
            sendNotification(task, false);
            checkedTasks.current.add(task.id);

            // 如果是持续提醒，设置定时器
            if (task.persistent_reminder) {
              setupPersistentReminder(task);
            }
          }
      }

      // Find matching rules for advance reminders
      const matchingRule = rules.find(rule => 
        rule.is_enabled && 
        (rule.condition_category === "all" || rule.condition_category === task.category) &&
        (rule.condition_priority === "all" || rule.condition_priority === task.priority)
      );

      const ruleAdvanceReminders = matchingRule?.action_advance_minutes || [];
      const allAdvanceReminders = [...new Set([...(task.advance_reminders || []), ...ruleAdvanceReminders])];

      // 检查提前提醒 (标准 + 高级策略)
      const strategySteps = task.reminder_strategy?.steps || [];
      
      // 合并标准提前提醒和策略步骤
      const standardAdvance = allAdvanceReminders.map(m => ({ offset_minutes: m, type: 'standard' }));
      const allCheckPoints = [...standardAdvance, ...strategySteps];

      if (allCheckPoints.length > 0) {
        allCheckPoints.forEach(point => {
          const minutes = point.offset_minutes;
          const advanceTime = new Date(reminderTime.getTime() - minutes * 60000);
          const checkKey = `${task.id}-advance-${minutes}-${point.type || 'strategy'}`;
          
          if (isPast(advanceTime) && !checkedTasks.current.has(checkKey)) {
            const minutesUntil = differenceInMinutes(reminderTime, now);
            // 允许稍微过期的检查（比如最近1分钟内），避免错过
            if (minutesUntil <= minutes && minutesUntil > minutes - 5) {
              
              if (point.type === 'standard') {
                  sendNotification(task, true);
              } else {
                  // 高级策略提醒
                  sendNotification(task, {
                      custom_message: point.custom_message || `还有 ${minutes} 分钟截止`,
                      message_type: point.message_type,
                      title: `⏳ ${task.title} 倒计时`
                  });
              }
              checkedTasks.current.add(checkKey);
            }
          }
        });
      }

      // Proactive: 检查是否为遗漏的重要约定 (High/Urgent, Overdue > 24h, Not Completed)
      // 且未被Snooze, 且未交互过
      if (['high', 'urgent'].includes(task.priority) && 
          task.status === 'pending' && 
          !task.snooze_until &&
          isPast(reminderTime)) {
            
            const hoursOverdue = Math.abs(differenceInMinutes(now, reminderTime)) / 60;
            const proactiveKey = `${task.id}-proactive-nag`;

            // 如果超过24小时未处理，且没有被此逻辑触发过
            if (hoursOverdue > 24 && !checkedTasks.current.has(proactiveKey)) {
                // 检查用户最近是否活跃但忽略了此约定
                const recentActivity = recentBehaviors.length > 0;
                
                if (recentActivity) {
                    sendNotification(task, {
                        custom_message: `检测到此重要约定已逾期 ${Math.round(hoursOverdue)} 小时。建议重新规划时间或分解约定。`,
                        message_type: 'urgent',
                        title: `⚠️ 遗漏约定关注：${task.title}`
                    });
                    checkedTasks.current.add(proactiveKey);
                    
                    // 记录AI主动干预
                    logBehaviorMutation.mutate({
                        event_type: "ai_proactive_remind",
                        task_id: task.id,
                        hour_of_day: new Date().getHours(),
                        day_of_week: new Date().getDay(),
                        category: task.category,
                        metadata: { reason: "high_priority_neglected" }
                    });
                }
            }
      }

      // Dynamic Adjustment: 简单的动态调整逻辑
      // 如果约定设置了 dynamic_adjustment，并且现在距离提醒时间还有一段距离
      if (task.reminder_strategy?.dynamic_adjustment && !isPast(reminderTime)) {
          const minutesUntil = differenceInMinutes(reminderTime, now);
          // 比如在提醒前 2 小时检查
          if (minutesUntil > 115 && minutesUntil < 125) {
             const dynamicKey = `${task.id}-dynamic-check`;
             if (!checkedTasks.current.has(dynamicKey)) {
                 // 这里可以调用LLM判断，但为了性能，我们做简单的启发式
                 // 如果用户在当前时间段通常不活跃（基于recentBehaviors），则建议推迟
                 // 简化：如果最近1小时没有行为，发送一个询问
                 const lastBehavior = recentBehaviors[0];
                 const lastBehaviorTime = lastBehavior ? new Date(lastBehavior.created_date) : null;
                 const isInactive = !lastBehaviorTime || differenceInMinutes(now, lastBehaviorTime) > 60;

                 if (isInactive) {
                    // 用户不活跃，可能不在电脑旁，发送一个 gentle 提醒建议调整
                    // 注意：这里实际发送通知可能打扰，最好是静默的或者是App内的Toast
                    // 我们这里模拟发送一个引导性通知
                    /* 
                    sendNotification(task, {
                        custom_message: "检测到您当前可能不在线，是否需要将此约定提醒推迟到更晚？",
                        message_type: "encouraging",
                        title: "🤖 智能调整建议"
                    });
                    */
                    // 暂时注释掉以免太烦人，仅作为架构预留
                 }
                 checkedTasks.current.add(dynamicKey);
             }
          }
      }
    });

    // 清理已完成约定的检查记录
    const currentTaskIds = new Set(tasks.map(t => t.id));
    checkedTasks.current.forEach(id => {
      if (!id || typeof id !== 'string' || !id.includes('-')) return;
      const parts = id.split('-');
      const taskId = (parts && parts.length > 0 && parts[0]) ? parts[0] : '';
      if (taskId && !currentTaskIds.has(taskId)) {
        checkedTasks.current.delete(id);
      }
    });
  }, [tasks, permission]);

  // 组件卸载时清理所有定时器
  useEffect(() => {
    return () => {
      Object.values(persistentIntervals.current).forEach(clearInterval);
    };
  }, []);

  // 不支持通知的浏览器或权限被拒绝时不显示任何内容
  if (!notificationSupported) {
    return null;
  }

  if (permission === "denied") {
    return (
      <div className="fixed bottom-4 right-4 bg-red-50 border-2 border-red-200 rounded-xl p-4 shadow-xl max-w-sm">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-800 mb-1">通知已禁用</h4>
            <p className="text-sm text-red-600">
              请在浏览器设置中允许通知，以接收约定提醒。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}