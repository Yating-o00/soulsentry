import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInMinutes, isPast, parseISO, isSameDay, isWithinInterval, startOfDay, endOfDay, set, getHours, getMinutes, format, isBefore } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Bell, Clock, X } from "lucide-react";
import { getPersonalizedCopy } from "@/components/notifications/personalizedCopy";
import { buildGeoContextLine } from "@/components/notifications/geoContext";
import { showAggregatedDueToast } from "@/components/notifications/AggregatedDueToast";

// 跨页面/跨 mount 持久化的"已通知"状态（避免移动端切换路由时重复弹窗）
// key 形如 notified-<taskId>-<type>-<YYYY-MM-DD>，过期自动清理
const NOTIFIED_STORAGE_KEY = 'ss_notified_keys_v1';
const NOTIFIED_TTL_MS = 36 * 60 * 60 * 1000; // 36 小时后自动失效

const loadNotifiedMap = () => {
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw);
    const now = Date.now();
    let dirty = false;
    Object.keys(map).forEach(k => {
      if (!map[k] || now - map[k] > NOTIFIED_TTL_MS) { delete map[k]; dirty = true; }
    });
    if (dirty) localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(map));
    return map;
  } catch { return {}; }
};

const isNotified = (key) => {
  const map = loadNotifiedMap();
  return !!map[key];
};

const markNotified = (key) => {
  try {
    const map = loadNotifiedMap();
    map[key] = Date.now();
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(map));
  } catch {}
};

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
  const BANNER_DISMISS_KEY = 'ss_notif_banner_dismissed_v1';
  const [bannerDismissed, setBannerDismissed] = useState(function() {
    try { return localStorage.getItem(BANNER_DISMISS_KEY) === '1'; } catch (e) { return false; }
  });
  const dismissBanner = () => {
    setBannerDismissed(true);
    try { localStorage.setItem(BANNER_DISMISS_KEY, '1'); } catch (e) {}
  };
  // 权限恢复为允许后，清除关闭记录，未来若再次被禁用仍能提示一次
  useEffect(function() {
    if (permission === 'granted') {
      try { localStorage.removeItem(BANNER_DISMISS_KEY); } catch (e) {}
    }
  }, [permission]);
  const checkedTasks = useRef(new Set());
  const audioRef = useRef(null);
  const queryClient = useQueryClient();
  const persistentIntervals = useRef({});

  // 全部加 retry: 1 + 静默错误，避免预览沙箱偶发 Network Error 抛 unhandled rejection
  const swallow = (fn) => async () => {
    try { return await fn(); } catch (e) { console.warn('[NotificationManager] query failed:', e?.message); return []; }
  };
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: swallow(() => base44.entities.Task.list()),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: recentBehaviors = [] } = useQuery({
    queryKey: ['recentBehaviors'],
    queryFn: swallow(() => base44.entities.UserBehavior.list('-created_date', 20)),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['notificationRules'],
    queryFn: swallow(() => base44.entities.NotificationRule.list()),
    initialData: [],
    retry: 1,
  });

  const { data: savedLocations = [] } = useQuery({
    queryKey: ['savedLocations'],
    queryFn: swallow(() => base44.entities.SavedLocation.list()),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try { return await base44.auth.me(); } catch (e) { console.warn('[NotificationManager] auth.me failed:', e?.message); return null; }
    },
    retry: 1,
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

  // 实时同步浏览器权限状态：用户在浏览器设置中开启通知后，无需刷新页面即可更新
  useEffect(function() {
    if (!notificationSupported) return;

    const syncPermission = () => {
      try { setPermission(Notification.permission); } catch (e) {}
    };

    // 1. 权限变化事件（Chrome/Edge 支持）
    let permStatus = null;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'notifications' }).then((status) => {
        permStatus = status;
        status.onchange = syncPermission;
      }).catch(() => {});
    }

    // 2. 页面重新获得焦点/可见时兜底重查（覆盖 Safari 等不支持 onchange 的浏览器）
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);

    return () => {
      if (permStatus) permStatus.onchange = null;
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, [notificationSupported]);

  const playSound = (soundType) => {
    const soundUrl = NOTIFICATION_SOUNDS[soundType];
    if (!soundUrl || soundType === "none") return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    audioRef.current = new Audio(soundUrl);
    audioRef.current.play().catch(err => console.log("Sound play failed:", err));
  };

  var sendNotification = async function(task, isAdvanceReminder) {
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
    } else {
        // 个性化文案：类别风格模板 + AI 根据任务内容实时生成（超时/失败自动回退模板）
        try {
          const copy = await getPersonalizedCopy(task, !!isAdvanceReminder);
          title = copy.title;
          body = copy.body;
        } catch (e) {
          console.warn("[NotificationManager] personalized copy failed:", e?.message);
        }
    }

    // 情境化：为工作/位置相关约定附加自然的地点上下文
    const geoLine = buildGeoContextLine(task, savedLocations);
    if (geoLine) body = body ? `${body}\n${geoLine}` : geoLine;

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
      <div className="bg-white rounded-xl shadow-2xl border border-[#384877]/20 p-4 min-w-[300px]">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-slate-800 mb-1">{title}</h4>
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
                className="text-xs bg-gradient-to-r from-[#384877] to-[#3b5aa2]"
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
      unstyled: true,
      classNames: { toast: '!bg-transparent !border-0 !shadow-none !p-0' },
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

    // 到点任务先收集，循环结束后统一派发：单条正常提醒，多条合并为一条聚合通知
    // 历史逾期任务在下方 isFreshlyDue 分支外会自动写 reminder_sent，不会涌入
    const freshlyDue = [];

    // 按 reminder_time 升序处理，让最早到点的任务优先获得名额
    const sortedTasks = [...tasks].sort((a, b) => {
      const ta = a?.reminder_time ? new Date(a.reminder_time).getTime() : Infinity;
      const tb = b?.reminder_time ? new Date(b.reminder_time).getTime() : Infinity;
      return ta - tb;
    });

    sortedTasks.forEach(task => {
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
          const snoozeKey = `${task.id}-snooze-${task.snooze_until}`;
          if (isPast(reminderTime) && !checkedTasks.current.has(snoozeKey) && !isNotified(snoozeKey)) {
             sendNotification(task, false);
             checkedTasks.current.add(snoozeKey);
             markNotified(snoozeKey);
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

                 if (!isNotified(uniqueKey) && !checkedTasks.current.has(uniqueKey)) {
                     // Tag task object temporarily to prevent DB update in sendNotification
                     const taskWithFlag = { ...task, is_daily_recurring_instance: true };
                     sendNotification(taskWithFlag, false);

                     checkedTasks.current.add(uniqueKey);
                     markNotified(uniqueKey);
                 }
             }
          }
      } else {
          // Single day logic — 用持久化 key 防止跨页面重复提醒
          // 关键修复：只对"刚到点 10 分钟内"的任务弹通知，避免打开 App 时把所有
          // 逾期未推送的任务一次性砸出来（用户报告的 6~7 条 11:21 通知在 19:30 集中弹出）
          const minutesSinceDue = differenceInMinutes(now, reminderTime);
          const isFreshlyDue = minutesSinceDue >= 0 && minutesSinceDue <= 10;
          const singleKey = `${task.id}-single-${format(reminderTime, 'yyyy-MM-dd-HH-mm')}`;
          if (isFreshlyDue && !task.reminder_sent && !checkedTasks.current.has(singleKey) && !isNotified(singleKey)) {
            freshlyDue.push({ task, singleKey });
          } else if (isPast(reminderTime) && !task.reminder_sent && minutesSinceDue > 10) {
            // 已严重逾期：真正写库 reminder_sent，避免每次打开 App 时同时涌出一堆历史 toast
            // 真正的"高优先级长时逾期"由下方 proactive-nag 逻辑兜底（仅 high/urgent 且 24h+）
            markNotified(singleKey);
            checkedTasks.current.add(singleKey);
            updateTaskMutation.mutate({ id: task.id, data: { reminder_sent: true } });
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
          
          if (isPast(advanceTime) && !checkedTasks.current.has(checkKey) && !isNotified(checkKey)) {
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
              markNotified(checkKey);
            }
          }
        });
      }

      // Proactive: 检查是否为遗漏的重要约定 (High/Urgent, Overdue > 24h, Not Completed)
      // 且未被Snooze, 且未交互过
      // 去重：若存在 ≥2 条被推迟/逾期的约定，它们已由「聚合待处理」卡片统一展示，
      // 不再对其中的逾期约定单独弹「紧急提醒」，避免同一约定重复弹窗
      const deferredCount = tasks.filter((t) => t && !t.deleted_at && !t.parent_task_id && (
        t.status === "snoozed" ||
        (t.status === "pending" && t.reminder_sent && t.reminder_time && isPast(parseISO(t.reminder_time)))
      )).length;
      const coveredByCatchup = deferredCount >= 2 && task.reminder_sent;

      if (!coveredByCatchup &&
          ['high', 'urgent'].includes(task.priority) && 
          task.status === 'pending' && 
          !task.snooze_until &&
          isPast(reminderTime)) {
            
            const hoursOverdue = Math.abs(differenceInMinutes(now, reminderTime)) / 60;
            const proactiveKey = `${task.id}-proactive-nag`;

            // 如果超过24小时未处理，且没有被此逻辑触发过
            if (hoursOverdue > 24 && !checkedTasks.current.has(proactiveKey) && !isNotified(proactiveKey)) {
                // 检查用户最近是否活跃但忽略了此约定
                const recentActivity = recentBehaviors.length > 0;
                
                if (recentActivity) {
                    sendNotification(task, {
                        custom_message: `检测到此重要约定已逾期 ${Math.round(hoursOverdue)} 小时。建议重新规划时间或分解约定。`,
                        message_type: 'urgent',
                        title: `⚠️ 遗漏约定关注：${task.title}`
                    });
                    checkedTasks.current.add(proactiveKey);
                    markNotified(proactiveKey);

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

    // 到点任务统一派发：单条正常提醒；多条合并为一条聚合通知，避免连环弹窗
    if (freshlyDue.length === 1) {
      const { task, singleKey } = freshlyDue[0];
      sendNotification(task, false);
      checkedTasks.current.add(singleKey);
      markNotified(singleKey);
      if (task.persistent_reminder) setupPersistentReminder(task);
    } else if (freshlyDue.length > 1) {
      freshlyDue.forEach(({ task, singleKey }) => {
        checkedTasks.current.add(singleKey);
        markNotified(singleKey);
        updateTaskMutation.mutate({ id: task.id, data: { reminder_sent: true } });
      });
      showAggregatedDueToast({
        tasks: freshlyDue.map(f => f.task),
        onSnoozeAll: (minutes) => freshlyDue.forEach(({ task }) => handleSnooze(task, minutes)),
      });
      if (notificationSupported && permission === "granted") {
        try {
          new Notification(`⏰ ${freshlyDue.length} 个约定同时到点`, {
            body: freshlyDue.slice(0, 5).map(f => f.task.title).join("、"),
            icon: "/favicon.ico",
            tag: "aggregated-due",
          });
        } catch (e) {}
      }
    }

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

  if (permission === "denied" && !bannerDismissed) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-50 border-2 border-red-200 rounded-xl p-4 shadow-xl max-w-sm z-50">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-800 mb-1">通知已禁用</h4>
            <p className="text-sm text-red-600">
              请在浏览器设置中允许通知，以接收约定提醒。
            </p>
          </div>
          <button
            onClick={dismissBanner}
            aria-label="关闭"
            className="text-red-400 hover:text-red-600 flex-shrink-0 no-min-size"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}