import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInMinutes, isPast, parseISO } from "date-fns";
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
  const [permission, setPermission] = useState(Notification.permission);
  const checkedTasks = useRef(new Set());
  const audioRef = useRef(null);
  const queryClient = useQueryClient();
  const persistentIntervals = useRef({});

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
    refetchInterval: 30000, // 每30秒检查一次
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['notificationRules'],
    queryFn: () => base44.entities.NotificationRule.list(),
    initialData: [],
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

  useEffect(() => {
    if (permission === "default") {
      Notification.requestPermission().then(setPermission);
    }
  }, [permission]);

  const playSound = (soundType) => {
    const soundUrl = NOTIFICATION_SOUNDS[soundType];
    if (!soundUrl || soundType === "none") return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    audioRef.current = new Audio(soundUrl);
    audioRef.current.play().catch(err => console.log("Sound play failed:", err));
  };

  const sendNotification = (task, isAdvanceReminder = false) => {
    if (permission !== "granted") return;

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

    const title = isAdvanceReminder 
      ? `📋 即将到来：${task.title}`
      : `⏰ 提醒：${task.title}`;
    
    const body = task.description || "现在是完成这个任务的时间";

    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: task.id,
      requireInteraction: task.persistent_reminder,
      silent: soundToPlay === "none",
    });

    playSound(soundToPlay);

    notification.onclick = () => {
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

    if (!isAdvanceReminder) {
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

      const reminderTime = task.snooze_until 
        ? parseISO(task.snooze_until)
        : parseISO(task.reminder_time);

      // 检查是否到了提醒时间
      if (isPast(reminderTime) && !task.reminder_sent && !checkedTasks.current.has(task.id)) {
        sendNotification(task, false);
        checkedTasks.current.add(task.id);

        // 如果是持续提醒，设置定时器
        if (task.persistent_reminder) {
          setupPersistentReminder(task);
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

      // 检查提前提醒
      if (allAdvanceReminders.length > 0) {
        allAdvanceReminders.forEach(minutes => {
          const advanceTime = new Date(reminderTime.getTime() - minutes * 60000);
          const checkKey = `${task.id}-advance-${minutes}`;
          
          if (isPast(advanceTime) && !checkedTasks.current.has(checkKey)) {
            const minutesUntil = differenceInMinutes(reminderTime, now);
            if (minutesUntil > 0 && minutesUntil <= minutes) {
              sendNotification(task, true);
              checkedTasks.current.add(checkKey);
            }
          }
        });
      }
    });

    // 清理已完成任务的检查记录
    const currentTaskIds = new Set(tasks.map(t => t.id));
    checkedTasks.current.forEach(id => {
      const taskId = id.split('-')[0];
      if (!currentTaskIds.has(taskId)) {
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

  if (permission === "denied") {
    return (
      <div className="fixed bottom-4 right-4 bg-red-50 border-2 border-red-200 rounded-xl p-4 shadow-xl max-w-sm">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-800 mb-1">通知已禁用</h4>
            <p className="text-sm text-red-600">
              请在浏览器设置中允许通知，以接收任务提醒。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}