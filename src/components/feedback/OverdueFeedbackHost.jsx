import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import TaskDeferralFeedback from "./TaskDeferralFeedback";

/**
 * 任务落地反馈闭环 - 宿主（克制版）
 *
 * 触发规则（满足任一即可，但每个任务终生只问一次）：
 *   1. 自动执行刚结束（监听 task-auto-executed 事件）
 *   2. 任务已过期 ≥ 30 分钟（首次进入应用 / 30 分钟一次的低频巡检）
 *
 * 已问过的任务：在 TaskDeferralLog 里有记录 → 永不再问
 * 本次会话内已弹过：内存集合避免重复
 * 用户主动关闭：本地缓存 7 天内不再弹该任务
 */
const SCAN_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟才扫一次，不打扰
const OVERDUE_THRESHOLD_MS = 30 * 60 * 1000; // 过期 30 分钟才考虑弹
const SKIP_CACHE_KEY = "ss_deferral_skip_v2";
const SKIP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadSkipMap() {
  try {
    const raw = localStorage.getItem(SKIP_CACHE_KEY);
    if (!raw) return {};
    const m = JSON.parse(raw);
    const now = Date.now();
    Object.keys(m).forEach((k) => {
      if (!m[k] || now - m[k] > SKIP_TTL_MS) delete m[k];
    });
    return m;
  } catch {
    return {};
  }
}

function saveSkipMap(m) {
  try {
    localStorage.setItem(SKIP_CACHE_KEY, JSON.stringify(m));
  } catch {}
}

export default function OverdueFeedbackHost() {
  const [pendingTask, setPendingTask] = useState(null);
  const scanningRef = useRef(false);
  // 已问过的 task_id 集合（来自数据库 + 本会话），避免重复打扰
  const askedSetRef = useRef(new Set());

  // 加载历史已记录过反馈的任务 ID，避免再次询问
  const loadAskedIds = useCallback(async () => {
    try {
      const logs = await base44.entities.TaskDeferralLog.list("-created_date", 200);
      (logs || []).forEach((l) => l.task_id && askedSetRef.current.add(l.task_id));
    } catch (e) {
      console.warn("[OverdueFeedback] load asked ids failed", e);
    }
  }, []);

  // 评估一个任务是否值得弹反馈
  const shouldAsk = useCallback((task) => {
    if (!task || !task.id) return false;
    if (task.deleted_at) return false;
    if (task.status === "completed" || task.status === "cancelled") return false;
    if (askedSetRef.current.has(task.id)) return false;
    const skipMap = loadSkipMap();
    if (skipMap[task.id]) return false;
    const target = task.end_time || task.reminder_time;
    if (!target) return false;
    const ts = new Date(target).getTime();
    if (isNaN(ts)) return false;
    return ts < Date.now() - OVERDUE_THRESHOLD_MS;
  }, []);

  // 后台低频巡检（30 分钟一次）
  const scan = useCallback(async () => {
    if (scanningRef.current || pendingTask) return;
    scanningRef.current = true;
    try {
      const tasks = await base44.entities.Task.filter(
        { status: "pending" },
        "-reminder_time",
        30
      );
      const overdue = (tasks || []).find(shouldAsk);
      if (overdue) setPendingTask(overdue);
    } catch (e) {
      console.warn("[OverdueFeedback] scan failed", e);
    } finally {
      scanningRef.current = false;
    }
  }, [pendingTask, shouldAsk]);

  // 监听"自动执行完成"事件，针对该任务立刻征询反馈
  useEffect(() => {
    const handler = async (e) => {
      const taskId = e?.detail?.task_id;
      if (!taskId || pendingTask) return;
      try {
        const task = await base44.entities.Task.get?.(taskId)
          .catch(() => null);
        const t = task || (await base44.entities.Task.filter({ id: taskId }, "-created_date", 1))?.[0];
        if (t && shouldAsk(t)) setPendingTask(t);
      } catch (err) {
        console.warn("[OverdueFeedback] auto-exec handler failed", err);
      }
    };
    window.addEventListener("task-auto-executed", handler);
    return () => window.removeEventListener("task-auto-executed", handler);
  }, [pendingTask, shouldAsk]);

  useEffect(() => {
    let cancelled = false;
    // 先加载已问过的 ID，再做一次低优先巡检
    (async () => {
      await loadAskedIds();
      if (cancelled) return;
      // 启动延迟 15 秒，避免与首屏抢资源
      setTimeout(() => { if (!cancelled) scan(); }, 15000);
    })();
    const timer = setInterval(scan, SCAN_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [scan, loadAskedIds]);

  const handleSkip = () => {
    if (pendingTask) {
      const m = loadSkipMap();
      m[pendingTask.id] = Date.now();
      saveSkipMap(m);
      askedSetRef.current.add(pendingTask.id);
    }
    setPendingTask(null);
  };

  const handleSubmit = async ({ reason_category, missing_prerequisite, reason_note, deferred_to }) => {
    if (!pendingTask) return;
    const originalTime = pendingTask.end_time || pendingTask.reminder_time;
    try {
      await base44.entities.TaskDeferralLog.create({
        task_id: pendingTask.id,
        task_title: pendingTask.title,
        original_time: originalTime,
        deferred_to,
        reason_category,
        missing_prerequisite: missing_prerequisite || "",
        reason_note: reason_note || "",
        carry_to_next_plan: true,
      });
      await base44.entities.Task.update(pendingTask.id, {
        reminder_time: deferred_to,
        status: "snoozed",
        snooze_until: deferred_to,
        snooze_count: (pendingTask.snooze_count || 0) + 1,
      });
      askedSetRef.current.add(pendingTask.id);
      window.dispatchEvent(new CustomEvent("task-deferral-logged", {
        detail: { task_id: pendingTask.id, reason_category, missing_prerequisite }
      }));

      toast.success("已记录原因，任务已顺延", {
        description: "AI 会在下次重排时优先考虑",
      });

      if (reason_category === "device_not_ready" && missing_prerequisite) {
        toast.info(`提示：建议尽快补全「${missing_prerequisite}」`, {
          description: "可在「我的账户」中完成相关授权",
          duration: 6000,
        });
      }
      setPendingTask(null);
    } catch (e) {
      console.error("[OverdueFeedback] submit failed", e);
      toast.error("记录失败，请稍后重试");
    }
  };

  return (
    <AnimatePresence>
      {pendingTask && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[60] w-[min(92vw,360px)]"
        >
          <TaskDeferralFeedback
            task={pendingTask}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}