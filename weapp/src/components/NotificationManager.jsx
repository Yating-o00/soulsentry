import { useEffect, useRef } from "react";
import Taro from "@tarojs/taro";
import { get, patch } from "@/utils/api";
import { getToken } from "@/utils/auth";
import notifySound from "@/lib/notifySound";

const POLL_INTERVAL_MS = 8000;
const NOTIFIED_KEY = "ss_notification_dedup";
const MODAL_COOLDOWN_MS = 2 * 60 * 1000; // 同一约定 2 分钟内不重复弹窗
const OVERDUE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 超过 2 小时的旧提醒不再弹窗
const BADGE_KEY = "ss_notification_badge";

function isDone(task) {
  return task.status === "completed" || task.status === "done" || task.status === "archived";
}

function isPast(timeStr) {
  if (!timeStr) return false;
  const t = new Date(timeStr);
  return !isNaN(t.getTime()) && t.getTime() <= Date.now();
}

function isRecentlyPast(timeStr) {
  if (!timeStr) return false;
  const t = new Date(timeStr).getTime();
  return Date.now() - t <= OVERDUE_THRESHOLD_MS;
}

function addMinutes(minutes) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function NotificationManager() {
  const runningRef = useRef(false);
  const timerRef = useRef(null);
  const modalOpenRef = useRef(false);
  const queueRef = useRef([]);
  const audioRef = useRef(null);
  const lastBadgeRef = useRef(0);

  const initAudio = () => {
    if (audioRef.current) return;
    try {
      const ctx = Taro.createInnerAudioContext();
      ctx.src = notifySound;
      ctx.volume = 1;
      ctx.obeyMuteSwitch = false; // 尽量播放，即使用户开了静音开关也尝试
      audioRef.current = ctx;
    } catch {
      // 不支持则忽略
    }
  };

  const playAlert = () => {
    try {
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current.play();
      }
    } catch {
      // ignore
    }

    try {
      // 震动节奏：长-短-长
      Taro.vibrateLong();
      setTimeout(() => Taro.vibrateShort(), 350);
      setTimeout(() => Taro.vibrateLong(), 550);
    } catch {
      // ignore
    }
  };

  const loadDedup = () => {
    try {
      return Taro.getStorageSync(NOTIFIED_KEY) || {};
    } catch {
      return {};
    }
  };

  const saveDedup = (map) => {
    try {
      Taro.setStorageSync(NOTIFIED_KEY, map);
    } catch {}
  };

  const shouldShow = (taskId, type) => {
    const map = loadDedup();
    const entry = map[taskId];
    if (!entry || !entry[type]) return true;
    return Date.now() - new Date(entry[type]).getTime() > MODAL_COOLDOWN_MS;
  };

  const markShown = (taskId, type) => {
    const map = loadDedup();
    map[taskId] = { ...(map[taskId] || {}), [type]: new Date().toISOString() };
    saveDedup(map);
  };

  const clearDedup = (taskId) => {
    const map = loadDedup();
    delete map[taskId];
    saveDedup(map);
  };

  const updateTask = async (id, data) => {
    try {
      await patch(`/tasks/${id}`, data);
    } catch (err) {
      console.error("[NotificationManager] updateTask failed", err);
      Taro.showToast({ title: "操作失败，请重试", icon: "none" });
    }
  };

  const updateBadge = (count) => {
    if (count === lastBadgeRef.current) return;
    lastBadgeRef.current = count;
    try {
      if (count > 0) {
        Taro.setTabBarBadge({ index: 0, text: String(count) });
      } else {
        Taro.removeTabBarBadge({ index: 0 });
      }
    } catch {
      // 部分环境下 tabBar 未就绪，忽略
    }
    try {
      Taro.setStorageSync(BADGE_KEY, count);
    } catch {}
  };

  const processQueue = async () => {
    if (modalOpenRef.current || queueRef.current.length === 0) return;

    const item = queueRef.current.shift();
    modalOpenRef.current = true;

    playAlert();

    const { task, type } = item;
    markShown(task.id, type);

    const timeStr = type === "reminder"
      ? (task.reminder_time ? `提醒时间 ${formatTime(task.reminder_time)}` : "")
      : (task.end_time ? `预计结束 ${formatTime(task.end_time)}` : "");

    const contentLines = [
      task.description ? task.description.slice(0, 80) : "",
      timeStr
    ].filter(Boolean);

    if (type === "reminder") {
      const { confirm } = await Taro.showModal({
        title: `⏰ 约定提醒：${task.title}`,
        content: contentLines.join("\n") || "到点啦，开始做这个约定了吗？",
        confirmText: "已完成",
        cancelText: "稍后 15 分钟"
      });

      if (confirm) {
        await updateTask(task.id, {
          status: "completed",
          completed_at: new Date().toISOString(),
          reminder_sent: true
        });
      } else {
        await updateTask(task.id, {
          reminder_time: addMinutes(15)
        });
      }
    } else {
      const { confirm } = await Taro.showModal({
        title: `🤝 约定跟进：${task.title}`,
        content: contentLines.join("\n") || "约定时间到了，完成了吗？需要再延长一点吗？",
        confirmText: "已完成",
        cancelText: "延长 30 分钟"
      });

      if (confirm) {
        await updateTask(task.id, {
          status: "completed",
          completed_at: new Date().toISOString(),
          end_reminder_sent: true
        });
      } else {
        await updateTask(task.id, {
          end_time: addMinutes(30)
        });
      }
    }

    clearDedup(task.id);
    modalOpenRef.current = false;
    processQueue();
  };

  const enqueue = (task, type) => {
    const key = `${task.id}:${type}`;
    if (queueRef.current.some((i) => `${i.task.id}:${i.type}` === key)) return;
    queueRef.current.push({ task, type });
    processQueue();
  };

  const checkTasks = async () => {
    if (!runningRef.current || modalOpenRef.current) return;
    if (!getToken()) {
      updateBadge(0);
      return;
    }

    try {
      const data = await get("/tasks", { parent_task_id: "", sort: "-reminder_time", limit: 200 });
      const tasks = Array.isArray(data) ? data : [];

      let dueCount = 0;

      for (const task of tasks) {
        if (!task || isDone(task) || task.deleted_at) continue;

        const isReminderDue =
          task.reminder_time &&
          isPast(task.reminder_time) &&
          isRecentlyPast(task.reminder_time) &&
          !task.reminder_sent &&
          shouldShow(task.id, "reminder");

        const isFollowUpDue =
          task.end_time &&
          isPast(task.end_time) &&
          isRecentlyPast(task.end_time) &&
          !task.end_reminder_sent &&
          shouldShow(task.id, "end");

        if (isReminderDue || isFollowUpDue) {
          dueCount += 1;
        }

        if (isReminderDue) {
          enqueue(task, "reminder");
        } else if (isFollowUpDue) {
          enqueue(task, "end");
        }
      }

      updateBadge(dueCount);
    } catch (err) {
      console.error("[NotificationManager] checkTasks failed", err);
    }
  };

  useEffect(() => {
    initAudio();

    const start = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      checkTasks();
      timerRef.current = setInterval(checkTasks, POLL_INTERVAL_MS);
    };

    const stop = () => {
      runningRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    start();

    Taro.onAppShow(start);
    Taro.onAppHide(stop);

    return () => {
      stop();
      if (Taro.offAppShow) Taro.offAppShow(start);
      if (Taro.offAppHide) Taro.offAppHide(stop);
      if (audioRef.current) {
        audioRef.current.destroy();
        audioRef.current = null;
      }
    };
  }, []);

  return null;
}
